import { findRepositoryRoot } from "./config.js";
import { collectArtifacts } from "./tools/collect-artifacts.js";
import { generateCypressSuite } from "./tools/generate-cypress-suite.js";
import { getChangedFiles } from "./tools/get-changed-files.js";
import { listRelevantCypressSpecs } from "./tools/list-relevant-cypress-specs.js";
import { mapImpactedFlows } from "./tools/map-impacted-flows.js";
import { readCypressReport } from "./tools/read-cypress-report.js";
import { runCypress } from "./tools/run-cypress.js";
import { suggestMissingTests } from "./tools/suggest-missing-tests.js";
import { validateCypressSuite } from "./tools/validate-cypress-suite.js";
import type {
  GetChangedFilesOutput,
  RegressionReviewInput,
  RegressionReviewOutput,
  RiskLevel,
} from "./types.js";

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function deriveRiskLevel(
  failedTestCount: number,
  hasCoverageGaps: boolean,
  suiteIsComplete: boolean,
  impactedFlows: string[],
  selectedSpecs: string[],
  cypressStatus: "skipped" | "passed" | "failed",
): RiskLevel {
  if (failedTestCount > 0 && (hasCoverageGaps || !suiteIsComplete)) {
    return "critical";
  }

  if (failedTestCount > 0) {
    return "high";
  }

  if (!suiteIsComplete) {
    return "high";
  }

  if (impactedFlows.length > 0 && selectedSpecs.length === 0) {
    return "high";
  }

  if (hasCoverageGaps || (cypressStatus === "skipped" && impactedFlows.length > 0)) {
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
    ? uniqueSorted(input.changedFiles)
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
    uniqueSorted([
      ...(changedFilesOutput?.changedFiles ?? []),
      ...(changedFilesOutput?.untrackedFiles ?? []),
    ]);

  const impacted = await mapImpactedFlows({
    changedFiles,
    flowMapPath: input.flowMapPath,
    repoRoot,
  });

  const suiteGeneration = await generateCypressSuite({
    flows: impacted.impactedFlowIds,
    policyPath: input.policyPath,
    flowSpecMapPath: input.flowSpecMapPath,
    repoRoot,
  });

  const selected = await listRelevantCypressSpecs({
    impactedFlowIds: impacted.impactedFlowIds,
    flowSpecMapPath: input.flowSpecMapPath,
    repoRoot,
  });

  const dryRun = input.dryRun ?? false;

  const run = await runCypress({
    specs: selected.resolvedSpecs,
    dryRun,
    headed: input.headed,
    browser: input.browser,
    configFile: input.configFile,
    reportPath: input.reportPath,
    reportFormat: input.reportFormat,
    extraArgs: input.extraArgs,
    repoRoot,
  });

  const shouldSkipRuntimeReads = dryRun === true || run.status === "skipped";
  const runtimeReadSkipReason =
    dryRun === true
      ? "Dry run enabled: report parsing skipped to avoid stale artifact reuse."
      : "Cypress execution skipped: report parsing and artifact collection skipped to avoid stale artifact reuse.";

  const report =
    shouldSkipRuntimeReads
      ? {
          tool: "read_cypress_report" as const,
          reportPath: run.reportPath,
          reportFormat: run.reportFormat,
          status: "stub" as const,
          totals: {
            tests: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            pending: 0,
            durationMs: 0,
          },
          failures: [],
          failedSpecFiles: [],
          warnings: [runtimeReadSkipReason],
        }
      : await readCypressReport({
          reportPath: run.reportPath,
          reportFormat: run.reportFormat,
          repoRoot,
        });

  const artifacts =
    shouldSkipRuntimeReads
      ? {
          tool: "collect_artifacts" as const,
          screenshots: [],
          failedScreenshots: [],
          videos: [],
          failedVideos: [],
          reports: [],
          missingDirectories: [],
          warnings: [runtimeReadSkipReason],
        }
      : await collectArtifacts({
          reportPath: run.reportPath,
          repoRoot,
        });

  const suggestions = await suggestMissingTests({
    impactedFlowIds: impacted.impactedFlowIds,
    unmappedFiles: impacted.unmappedFiles,
    flowSpecMapPath: input.flowSpecMapPath,
    repoRoot,
  });

  const suiteValidation = await validateCypressSuite({
    flows: impacted.impactedFlowIds,
    policyPath: input.policyPath,
    flowSpecMapPath: input.flowSpecMapPath,
    repoRoot,
  });

  const suiteGapSuggestions: string[] = [];
  for (const flowResult of suiteValidation.flowResults) {
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
  }

  const warnings = uniqueSorted([
    ...(changedFilesOutput?.warnings ?? []),
    ...impacted.warnings,
    ...suiteGeneration.warnings,
    ...selected.warnings,
    ...run.warnings,
    ...report.warnings,
    ...artifacts.warnings,
    ...suggestions.warnings,
    ...suiteValidation.warnings,
  ]);

  const mergedSuggestions = uniqueSorted([...suggestions.suggestions, ...suiteGapSuggestions]);
  const mergedFlowsWithoutSpecs = uniqueSorted([
    ...suggestions.flowsWithoutSpecs,
    ...suiteValidation.flowResults
      .filter((result) => result.mappedSpecs.length === 0 || result.missingSpecFiles.length > 0)
      .map((result) => result.flowId),
  ]);

  const hasCoverageGaps = mergedSuggestions.length > 0;
  const riskLevel = deriveRiskLevel(
    report.totals.failed,
    hasCoverageGaps,
    suiteValidation.isComplete,
    impacted.impactedFlowIds,
    selected.resolvedSpecs,
    run.status,
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
      unmappedFiles: impacted.unmappedFiles,
    },
    impactedFlows: impacted.impactedFlowIds,
    suiteGeneration: {
      targetFlows: suiteGeneration.targetFlows,
      createdSpecFiles: suiteGeneration.createdSpecFiles,
      updatedSpecFiles: suiteGeneration.updatedSpecFiles,
      unchangedSpecFiles: suiteGeneration.unchangedSpecFiles,
      mappingUpdated: suiteGeneration.mappingUpdated,
    },
    selectedSpecs: selected.resolvedSpecs,
    passFailSummary: {
      cypressStatus: run.status,
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
      unmappedFiles: suggestions.unmappedFiles,
      suggestions: mergedSuggestions,
    },
    suiteCompleteness: {
      isComplete: suiteValidation.isComplete,
      incompleteFlows: suiteValidation.incompleteFlows,
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
