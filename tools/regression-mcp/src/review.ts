import { findRepositoryRoot } from "./config.js";
import { collectArtifacts } from "./tools/collect-artifacts.js";
import { generatePlaywrightSuite } from "./tools/generate-playwright-suite.js";
import { getChangedFiles } from "./tools/get-changed-files.js";
import { listRelevantPlaywrightSpecs } from "./tools/list-relevant-playwright-specs.js";
import { mapImpactedFlows } from "./tools/map-impacted-flows.js";
import { readPlaywrightReport } from "./tools/read-playwright-report.js";
import { runPlaywright } from "./tools/run-playwright.js";
import { suggestPolicyClarifications } from "./tools/suggest-policy-clarifications.js";
import { suggestMissingTests } from "./tools/suggest-missing-tests.js";
import { validatePlaywrightSuite } from "./tools/validate-playwright-suite.js";
import type {
  GetChangedFilesOutput,
  RegressionReviewInput,
  RegressionReviewOutput,
  RiskLevel,
} from "./types.js";
import { toSortedUnique } from "./utils/fs.js";

function deriveRegressionRiskLevel(
  failedTestCount: number,
  hasCoverageGaps: boolean,
  suiteIsComplete: boolean,
  impactedFlows: string[],
  selectedSpecs: string[],
  runnerStatus: "skipped" | "passed" | "failed",
  hasBlockingClarifications: boolean,
): RiskLevel {
  if (failedTestCount > 0 && (hasCoverageGaps || !suiteIsComplete)) {
    return "critical";
  }

  if (failedTestCount > 0) {
    return "high";
  }

  if (hasBlockingClarifications) {
    return "high";
  }

  if (!suiteIsComplete) {
    return "high";
  }

  if (impactedFlows.length > 0 && selectedSpecs.length === 0) {
    return "high";
  }

  if (hasCoverageGaps || (runnerStatus === "skipped" && impactedFlows.length > 0)) {
    return "medium";
  }

  return "low";
}

export async function generateRegressionReview(
  input: RegressionReviewInput = {},
): Promise<RegressionReviewOutput> {
  const repoRoot = await findRepositoryRoot(input.repoRoot ?? process.cwd());

  const includeUntracked = input.includeUntracked ?? true;
  const changedFilesInput = Array.isArray(input.changedFiles)
    ? toSortedUnique(input.changedFiles)
    : undefined;

  let changedFilesOutput: GetChangedFilesOutput | undefined;

  if (!changedFilesInput) {
    changedFilesOutput = await getChangedFiles({
      baseRef: input.baseRef,
      headRef: input.headRef,
      includeUntracked,
      repoRoot,
    });
  }

  const changedFiles =
    changedFilesInput ??
    toSortedUnique([
      ...(changedFilesOutput?.changedFiles ?? []),
      ...(changedFilesOutput?.untrackedFiles ?? []),
    ]);

  const impacted = await mapImpactedFlows({
    changedFiles,
    flowMapPath: input.flowMapPath,
    repoRoot,
  });

  const safeImpactedFlowIds = impacted.impactedFlowIds ?? [];
  const safeUnmappedFiles = impacted.unmappedFiles ?? [];

  // generatePlaywrightSuite must complete first as it may create/update spec files and flow-spec-map
  const suiteGeneration = await generatePlaywrightSuite({
    flows: safeImpactedFlowIds,
    policyPath: input.policyPath,
    flowSpecMapPath: input.flowSpecMapPath,
    repoRoot,
  });

  // After suite generation, these three are independent and can run in parallel:
  // - listRelevantPlaywrightSpecs reads the (now stable) flow-spec-map
  // - suggestMissingTests only needs impacted flow data
  // - suggestPolicyClarifications only needs policy + impacted flow data
  const [selected, suggestions, policyClarifications] = await Promise.all([
    listRelevantPlaywrightSpecs({
      impactedFlowIds: safeImpactedFlowIds,
      flowSpecMapPath: input.flowSpecMapPath,
      repoRoot,
    }),
    suggestMissingTests({
      impactedFlowIds: safeImpactedFlowIds,
      unmappedFiles: safeUnmappedFiles,
      flowSpecMapPath: input.flowSpecMapPath,
      repoRoot,
    }),
    suggestPolicyClarifications({
      flows: safeImpactedFlowIds,
      policyPath: input.policyPath,
      flowMapPath: input.flowMapPath,
      flowSpecMapPath: input.flowSpecMapPath,
      repoRoot,
    }),
  ]);

  const safeSpecPatterns = selected.specPatterns ?? [];
  const safeSuggestions = suggestions.suggestions ?? [];
  const safeFlowsWithoutSpecs = suggestions.flowsWithoutSpecs ?? [];
  const safeSuggestionsUnmappedFiles = suggestions.unmappedFiles ?? [];
  const safePolicyClarificationQuestions = policyClarifications.questions ?? [];

  const dryRun = input.dryRun ?? false;

  const run = await runPlaywright({
    specs: safeSpecPatterns,
    dryRun,
    headed: input.headed,
    project: input.project,
    configFile: input.configFile,
    reportPath: input.reportPath,
    reportFormat: input.reportFormat,
    extraArgs: input.extraArgs,
    repoRoot,
    workDir: input.workDir,
  });

  const shouldSkipRuntimeReads = dryRun === true || run.status === "skipped";
  const runtimeReadSkipReason =
    dryRun === true
      ? "Dry run enabled: report parsing skipped to avoid stale artifact reuse."
      : "Playwright execution skipped: report parsing and artifact collection skipped to avoid stale artifact reuse.";

  const stubReport = {
    tool: "read_playwright_report" as const,
    reportPath: run.reportPath,
    reportFormat: run.reportFormat,
    status: "stub" as const,
    totals: { tests: 0, passed: 0, failed: 0, skipped: 0, pending: 0, durationMs: 0 },
    failures: [] as string[],
    failedSpecFiles: [] as string[],
    warnings: [runtimeReadSkipReason],
  };

  const stubArtifacts = {
    tool: "collect_artifacts" as const,
    screenshots: [] as string[],
    failedScreenshots: [] as string[],
    videos: [] as string[],
    failedVideos: [] as string[],
    reports: [] as string[],
    missingDirectories: [] as string[],
    warnings: [runtimeReadSkipReason],
  };

  // After Playwright run, report parsing, artifact collection, and suite validation are independent
  const [report, artifacts, suiteValidation] = shouldSkipRuntimeReads
    ? [
        stubReport,
        stubArtifacts,
        await validatePlaywrightSuite({
          flows: safeImpactedFlowIds,
          policyPath: input.policyPath,
          flowSpecMapPath: input.flowSpecMapPath,
          repoRoot,
        }),
      ]
    : await Promise.all([
        readPlaywrightReport({
          reportPath: run.reportPath,
          reportFormat: run.reportFormat,
          repoRoot,
        }),
        collectArtifacts({
          reportPath: run.reportPath,
          repoRoot,
        }),
        validatePlaywrightSuite({
          flows: safeImpactedFlowIds,
          policyPath: input.policyPath,
          flowSpecMapPath: input.flowSpecMapPath,
          repoRoot,
        }),
      ]);

  const safeFlowResults = suiteValidation.flowResults ?? [];
  const safeSuiteIsComplete = suiteValidation.isComplete ?? false;
  const safeIncompleteFlows = suiteValidation.incompleteFlows ?? [];
  const safeScaffoldFlows = suiteValidation.scaffoldFlows ?? [];

  const suiteGapSuggestions: string[] = [];
  for (const flowResult of safeFlowResults) {
    if (flowResult.missingSpecFiles.length > 0) {
      suiteGapSuggestions.push(
        `Flow '${flowResult.flowId}' is missing spec files: ${flowResult.missingSpecFiles.join(", ")}.`,
      );
    }

    if (flowResult.missingScenarios.length > 0) {
      suiteGapSuggestions.push(
        `Flow '${flowResult.flowId}' is missing coverage scenarios: ${flowResult.missingScenarios.join(", ")}.`,
      );
    }

    if (flowResult.scaffoldScenarios.length > 0) {
      suiteGapSuggestions.push(
        `Flow '${flowResult.flowId}' has scaffold-only scenarios that block regression gate: ${flowResult.scaffoldScenarios.join(", ")}.`,
      );
    }
  }

  const warnings = toSortedUnique([
    ...(changedFilesOutput?.warnings ?? []),
    ...impacted.warnings,
    ...suiteGeneration.warnings,
    ...selected.warnings,
    ...run.warnings,
    ...report.warnings,
    ...artifacts.warnings,
    ...suggestions.warnings,
    ...policyClarifications.warnings,
    ...suiteValidation.warnings,
  ]);

  const mergedSuggestions = toSortedUnique([...safeSuggestions, ...suiteGapSuggestions]);
  const mergedFlowsWithoutSpecs = toSortedUnique([
    ...safeFlowsWithoutSpecs,
    ...safeFlowResults
      .filter((result) => result.mappedSpecs.length === 0 || result.missingSpecFiles.length > 0)
      .map((result) => result.flowId),
  ]);

  const hasBlockingClarifications = safePolicyClarificationQuestions.some((question) => question.blocking);
  const hasCoverageGaps = mergedSuggestions.length > 0 || safeScaffoldFlows.length > 0;
  const riskLevel = deriveRegressionRiskLevel(
    report.totals.failed,
    hasCoverageGaps,
    safeSuiteIsComplete,
    safeImpactedFlowIds,
    safeSpecPatterns,
    run.status,
    hasBlockingClarifications,
  );

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    repoRoot,
    inputs: {
      baseRef: input.baseRef,
      headRef: input.headRef,
      includeUntracked,
      changedFiles,
      dryRun,
    },
    mapping: {
      fileToFlows: impacted.fileToFlows,
      unmappedFiles: safeUnmappedFiles,
    },
    impactedFlows: safeImpactedFlowIds,
    suiteGeneration: {
      targetFlows: suiteGeneration.targetFlows,
      createdSpecFiles: suiteGeneration.createdSpecFiles,
      updatedSpecFiles: suiteGeneration.updatedSpecFiles,
      unchangedSpecFiles: suiteGeneration.unchangedSpecFiles,
      mappingUpdated: suiteGeneration.mappingUpdated,
    },
    selectedSpecs: safeSpecPatterns,
    passFailSummary: {
      runnerStatus: run.status,
      exitCode: run.exitCode,
      totals: report.totals,
    },
    failedTests: report.failures,
    artifactPaths: {
      screenshots: artifacts.screenshots,
      failedScreenshots: artifacts.failedScreenshots,
      videos: artifacts.videos,
      failedVideos: artifacts.failedVideos,
      reports: artifacts.reports,
    },
    suggestedMissingTests: {
      flowsWithoutSpecs: mergedFlowsWithoutSpecs,
      unmappedFiles: safeSuggestionsUnmappedFiles,
      suggestions: mergedSuggestions,
    },
    clarificationQuestions: safePolicyClarificationQuestions,
    suiteCompleteness: {
      isComplete: safeSuiteIsComplete,
      incompleteFlows: safeIncompleteFlows,
      scaffoldFlows: safeScaffoldFlows,
    },
    riskLevel,
    execution: {
      command: run.command,
      reportPath: run.reportPath,
      reportFormat: run.reportFormat,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      durationMs: run.durationMs,
    },
    warnings,
  };
}
