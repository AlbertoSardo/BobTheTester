import { readFile } from "node:fs/promises";

import {
  DEFAULT_BUSINESS_POLICY_PATH,
  DEFAULT_FLOW_MAP_PATH,
  DEFAULT_FLOW_SPEC_MAP_PATH,
  fileExists,
  findRepositoryRoot,
  loadBusinessReviewPolicy,
  loadFlowMapConfig,
  loadFlowSpecMapConfig,
  loadToolingConfig,
  resolveFromRepoRoot,
} from "../config.js";
import type {
  EvaluatePolicyCoverageInput,
  EvaluatePolicyCoverageOutput,
  FlowCoverageScore,
  FlowSpecMapConfig,
  JsonValue,
  RiskLevel,
  ToolingConfig,
  UncoveredBranch,
} from "../types.js";
import { toSortedUnique } from "../utils/fs.js";
import { asObjectRecord, asStringArrayStrict } from "../utils/helpers.js";
import { matchesPattern, normalizeForMatch } from "../utils/pattern.js";
import { createTestTitlePattern, extractTestTitle, parseCoverageTitle } from "../utils/scaffold.js";
import { getChangedFiles } from "./get-changed-files.js";

const COVERAGE_GATE_THRESHOLD = 70;

interface V8CoverageEntry {
  url: string;
  functions: Array<{
    functionName: string;
    ranges: Array<{
      startOffset: number;
      endOffset: number;
      count: number;
    }>;
  }>;
}

interface MonocartSummaryEntry {
  name: string;
  bytes?: { covered: number; total: number; pct: number };
  statements?: { covered: number; total: number; pct: number };
  branches?: { covered: number; total: number; pct: number };
  functions?: { covered: number; total: number; pct: number };
  lines?: { covered: number; total: number; pct: number };
  files?: MonocartSummaryEntry[];
  uncoveredLines?: string;
}

interface ParsedCoverage {
  branchCoverageByFile: Map<string, number>;
  uncoveredBranchesByFile: Map<string, UncoveredBranch[]>;
  overallBranchCoverage: number;
}

function parseMonocartReport(payload: Record<string, unknown>): ParsedCoverage {
  const branchCoverageByFile = new Map<string, number>();
  const uncoveredBranchesByFile = new Map<string, UncoveredBranch[]>();
  let totalBranches = 0;
  let coveredBranches = 0;

  // Monocart report has a "summary" with file-level data
  const summary = payload.summary as MonocartSummaryEntry | undefined;
  const files =
    summary?.files ?? (Array.isArray(payload.files) ? (payload.files as MonocartSummaryEntry[]) : []);

  for (const file of files) {
    if (!file.name || !file.branches) {
      continue;
    }

    const filePath = file.name;
    const pct = file.branches.pct ?? 0;
    branchCoverageByFile.set(filePath, pct);
    totalBranches += file.branches.total ?? 0;
    coveredBranches += file.branches.covered ?? 0;

    // Track uncovered branches
    if (file.branches.total > 0 && file.branches.covered < file.branches.total) {
      const uncovered: UncoveredBranch[] = [];
      // If uncoveredLines is available, parse it for branch info
      if (file.uncoveredLines) {
        const lineRanges = file.uncoveredLines.split(",").map((s) => s.trim());
        for (const range of lineRanges) {
          const lineNum = parseInt(range.split("-")[0], 10);
          if (!isNaN(lineNum)) {
            uncovered.push({ file: filePath, line: lineNum, type: "branch" });
          }
        }
      }
      if (uncovered.length > 0) {
        uncoveredBranchesByFile.set(filePath, uncovered);
      }
    }
  }

  return {
    branchCoverageByFile,
    uncoveredBranchesByFile,
    overallBranchCoverage: totalBranches > 0 ? Math.round((coveredBranches / totalBranches) * 100) : 0,
  };
}

function parseV8CoverageArray(entries: V8CoverageEntry[]): ParsedCoverage {
  const branchCoverageByFile = new Map<string, number>();
  const uncoveredBranchesByFile = new Map<string, UncoveredBranch[]>();
  let totalRanges = 0;
  let coveredRanges = 0;

  for (const entry of entries) {
    if (!entry.url || !entry.functions) {
      continue;
    }

    let fileTotal = 0;
    let fileCovered = 0;
    const uncovered: UncoveredBranch[] = [];

    for (const fn of entry.functions) {
      for (const range of fn.ranges) {
        fileTotal += 1;
        if (range.count > 0) {
          fileCovered += 1;
        } else {
          uncovered.push({ file: entry.url, line: range.startOffset, type: "range" });
        }
      }
    }

    totalRanges += fileTotal;
    coveredRanges += fileCovered;

    const pct = fileTotal > 0 ? Math.round((fileCovered / fileTotal) * 100) : 100;
    branchCoverageByFile.set(entry.url, pct);

    if (uncovered.length > 0) {
      uncoveredBranchesByFile.set(entry.url, uncovered.slice(0, 10)); // Cap at 10 per file
    }
  }

  return {
    branchCoverageByFile,
    uncoveredBranchesByFile,
    overallBranchCoverage: totalRanges > 0 ? Math.round((coveredRanges / totalRanges) * 100) : 0,
  };
}

async function loadCoverageReport(reportPath: string, warnings: string[]): Promise<ParsedCoverage | null> {
  if (!(await fileExists(reportPath))) {
    return null;
  }

  try {
    const raw = await readFile(reportPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;

    // Monocart format: object with summary
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      if (record.summary || record.files) {
        // Validate Monocart shape: summary/files must be objects or arrays
        if (record.summary !== undefined && (typeof record.summary !== "object" || record.summary === null)) {
          warnings.push(
            `Coverage report at '${reportPath}' has an invalid 'summary' field (expected object, got ${typeof record.summary}).`,
          );
          return null;
        }
        if (record.files !== undefined && !Array.isArray(record.files)) {
          warnings.push(
            `Coverage report at '${reportPath}' has an invalid 'files' field (expected array, got ${typeof record.files}).`,
          );
          return null;
        }
        return parseMonocartReport(record);
      }
    }

    // V8 format: array of entries
    if (Array.isArray(parsed)) {
      // Validate V8 shape: each element must be an object with 'url' (string) and 'functions' (array)
      for (const entry of parsed) {
        if (typeof entry !== "object" || entry === null) {
          continue;
        }
        const obj = entry as Record<string, unknown>;
        if ("url" in obj) {
          if (typeof obj.url !== "string") {
            warnings.push(
              `Coverage report at '${reportPath}' contains a V8 entry with non-string 'url' field.`,
            );
            return null;
          }
          if ("functions" in obj && !Array.isArray(obj.functions)) {
            warnings.push(
              `Coverage report at '${reportPath}' contains a V8 entry with non-array 'functions' field.`,
            );
            return null;
          }
        }
      }
      const entries = parsed.filter(
        (entry) => typeof entry === "object" && entry !== null && "url" in entry,
      ) as V8CoverageEntry[];
      if (entries.length > 0) {
        return parseV8CoverageArray(entries);
      }
    }

    return null;
  } catch (error) {
    warnings.push(
      `Coverage report exists but could not be parsed at '${reportPath}': ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

interface SpecScenarioEntry {
  scenarioTitle: string;
  status: "scaffold" | "implemented";
}

function extractScenarioEntries(specContent: string): SpecScenarioEntry[] {
  const entries: SpecScenarioEntry[] = [];
  const testTitlePattern = createTestTitlePattern();

  let match = testTitlePattern.exec(specContent);
  while (match) {
    const title = extractTestTitle(match);
    const parsed = parseCoverageTitle(title);
    if (parsed) {
      entries.push({
        scenarioTitle: parsed.scenarioTitle,
        status: parsed.status ?? "scaffold",
      });
    }
    match = testTitlePattern.exec(specContent);
  }

  return entries;
}

function getFlowFiles(
  flowId: string,
  fileToFlows: Record<string, string[]>,
  changedFiles: string[],
): string[] {
  const result: string[] = [];
  for (const file of changedFiles) {
    const flows = fileToFlows[file] ?? [];
    if (flows.includes(flowId)) {
      result.push(file);
    }
  }
  return result;
}

function computeBranchCoverageForFlow(
  flowFiles: string[],
  coverage: ParsedCoverage | null,
): { branchCoverage: number; uncoveredBranches: UncoveredBranch[] } {
  if (!coverage || flowFiles.length === 0) {
    return { branchCoverage: 0, uncoveredBranches: [] };
  }

  let totalPct = 0;
  let matchedFiles = 0;
  const allUncovered: UncoveredBranch[] = [];

  for (const flowFile of flowFiles) {
    const normalizedFlowFile = normalizeForMatch(flowFile);

    for (const [coverageFile, pct] of coverage.branchCoverageByFile.entries()) {
      const normalizedCoverageFile = normalizeForMatch(coverageFile);
      if (
        normalizedCoverageFile.includes(normalizedFlowFile) ||
        normalizedFlowFile.includes(normalizedCoverageFile) ||
        matchesPattern(normalizedFlowFile, normalizedCoverageFile)
      ) {
        totalPct += pct;
        matchedFiles += 1;

        const uncovered = coverage.uncoveredBranchesByFile.get(coverageFile);
        if (uncovered) {
          allUncovered.push(...uncovered);
        }
        break;
      }
    }
  }

  const branchCoverage = matchedFiles > 0 ? Math.round(totalPct / matchedFiles) : 0;
  return { branchCoverage, uncoveredBranches: allUncovered.slice(0, 25) };
}

function deriveCoverageRiskLevel(overallScore: number): RiskLevel {
  if (overallScore >= 80) {
    return "low";
  }
  if (overallScore >= 60) {
    return "medium";
  }
  if (overallScore >= 40) {
    return "high";
  }
  return "critical";
}

// ---------------------------------------------------------------------------
// Pipeline stage: resolve changed files and map them to flows
// ---------------------------------------------------------------------------

interface ResolvedChangedFilesAndFlows {
  changedFiles: string[];
  fileToFlows: Record<string, string[]>;
  impactedFlowIds: string[];
  knownFlowIds: string[];
  flowsRecord: Record<string, JsonValue>;
  resolvedPolicyPath: string;
  flowSpecMapConfig: FlowSpecMapConfig;
}

async function resolveChangedFilesAndFlows(
  input: EvaluatePolicyCoverageInput,
  repoRoot: string,
  toolingConfig: ToolingConfig,
): Promise<{ result: ResolvedChangedFilesAndFlows; warnings: string[] }> {
  const warnings: string[] = [];
  const policyPath = input.policyPath ?? DEFAULT_BUSINESS_POLICY_PATH;
  const flowMapPath = input.flowMapPath ?? DEFAULT_FLOW_MAP_PATH;
  const flowSpecMapPath = input.flowSpecMapPath ?? DEFAULT_FLOW_SPEC_MAP_PATH;

  // Load policy
  const { path: resolvedPolicyPath, policy } = await loadBusinessReviewPolicy(repoRoot, policyPath);
  const flowsRecord = asObjectRecord(policy.flows) ?? {};
  const knownFlowIds = Object.keys(flowsRecord).sort((a, b) => a.localeCompare(b));

  // Resolve changed files
  let changedFiles: string[];
  if (Array.isArray(input.changedFiles) && input.changedFiles.length > 0) {
    changedFiles = toSortedUnique(input.changedFiles);
  } else {
    const changedFilesOutput = await getChangedFiles({
      baseRef: input.baseRef,
      headRef: input.headRef,
      includeUntracked: input.includeUntracked ?? true,
      repoRoot,
    });
    changedFiles = toSortedUnique([...changedFilesOutput.changedFiles, ...changedFilesOutput.untrackedFiles]);
  }

  // Map changed files to flows
  const { config: flowMapConfig } = await loadFlowMapConfig(repoRoot, flowMapPath);
  const fileToFlows: Record<string, string[]> = {};
  for (const file of changedFiles) {
    const normalizedFile = normalizeForMatch(file);
    const matchedFlows: string[] = [];
    for (const mapping of flowMapConfig.mappings) {
      for (const pattern of mapping.filePatterns) {
        if (matchesPattern(normalizedFile, normalizeForMatch(pattern))) {
          matchedFlows.push(mapping.flowId);
          break;
        }
      }
    }
    if (matchedFlows.length > 0) {
      fileToFlows[file] = toSortedUnique(matchedFlows);
    }
  }

  const impactedFlowIds = toSortedUnique(
    Object.values(fileToFlows)
      .flat()
      .filter((flowId) => knownFlowIds.includes(flowId)),
  );

  // Load flow-spec map
  const { config: flowSpecMapConfig } = await loadFlowSpecMapConfig(repoRoot, flowSpecMapPath);

  // Load coverage report (warnings only — coverage loaded separately)
  void toolingConfig; // used by caller for coverageReportPath

  return {
    result: {
      changedFiles,
      fileToFlows,
      impactedFlowIds,
      knownFlowIds,
      flowsRecord,
      resolvedPolicyPath,
      flowSpecMapConfig,
    },
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Pipeline stage: evaluate a single flow's coverage score
// ---------------------------------------------------------------------------

async function evaluateFlowScore(
  flowId: string,
  flowPolicy: Record<string, JsonValue>,
  flowSpecMapConfig: FlowSpecMapConfig,
  repoRoot: string,
  fileToFlows: Record<string, string[]>,
  changedFiles: string[],
  coverageData: ParsedCoverage | null,
): Promise<FlowCoverageScore> {
  // 1. Must-hold coverage: check which invariants have corresponding implemented tests
  const mustHoldItems = asStringArrayStrict(flowPolicy.mustHold);
  const minimumCoverage = asStringArrayStrict(flowPolicy.minimumRegressionCoverage);

  // Read spec files for this flow
  const specPaths = flowSpecMapConfig.flowToSpecs[flowId] ?? [];
  const concreteSpecPaths = specPaths.filter((p) => !p.includes("*") && !p.includes("?"));
  const allScenarioEntries: SpecScenarioEntry[] = [];

  for (const specPath of concreteSpecPaths) {
    const absolutePath = resolveFromRepoRoot(repoRoot, specPath);
    if (!(await fileExists(absolutePath))) {
      continue;
    }
    const content = await readFile(absolutePath, "utf-8");
    allScenarioEntries.push(...extractScenarioEntries(content));
  }

  // Check implemented scenarios
  const implementedTitles = new Set(
    allScenarioEntries.filter((e) => e.status === "implemented").map((e) => e.scenarioTitle),
  );
  const scaffoldTitles = new Set(
    allScenarioEntries
      .filter((e) => e.status === "scaffold")
      .map((e) => e.scenarioTitle)
      .filter((t) => !implementedTitles.has(t)),
  );

  // Must-hold coverage: an invariant is "covered" if there's an implemented scenario
  // whose title contains keywords from the invariant
  const coveredMustHoldItems: string[] = [];
  const uncoveredMustHoldItems: string[] = [];

  for (const invariant of mustHoldItems) {
    const invariantWords = invariant
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const isCovered = Array.from(implementedTitles).some((title) => {
      const titleLower = title.toLowerCase();
      // At least 40% of meaningful words from the invariant appear in a test title
      const matchingWords = invariantWords.filter((word) => titleLower.includes(word));
      return invariantWords.length > 0 && matchingWords.length >= Math.ceil(invariantWords.length * 0.4);
    });

    if (isCovered) {
      coveredMustHoldItems.push(invariant);
    } else {
      uncoveredMustHoldItems.push(invariant);
    }
  }

  // 2. Regression scenario coverage
  const implementedScenarioCount = minimumCoverage.filter((scenario) =>
    implementedTitles.has(scenario),
  ).length;
  const scaffoldScenarioCount = minimumCoverage.filter(
    (scenario) => scaffoldTitles.has(scenario) && !implementedTitles.has(scenario),
  ).length;
  const uncoveredScenarioList = minimumCoverage.filter(
    (scenario) => !implementedTitles.has(scenario) && !scaffoldTitles.has(scenario),
  );

  // 3. Branch coverage for this flow's files
  const flowFiles = getFlowFiles(flowId, fileToFlows, changedFiles);
  const { branchCoverage, uncoveredBranches } = computeBranchCoverageForFlow(flowFiles, coverageData);

  // Compute scores
  const mustHoldCov =
    mustHoldItems.length > 0 ? Math.round((coveredMustHoldItems.length / mustHoldItems.length) * 100) : 100;
  const regressionCov =
    minimumCoverage.length > 0 ? Math.round((implementedScenarioCount / minimumCoverage.length) * 100) : 100;

  // Weighted average: regression scenarios matter most (50%), then must-hold (30%), then branches (20%)
  const overallFlowScore = Math.round(regressionCov * 0.5 + mustHoldCov * 0.3 + branchCoverage * 0.2);

  return {
    flowId,
    overallScore: overallFlowScore,
    mustHoldCoverage: mustHoldCov,
    regressionCoverage: regressionCov,
    branchCoverage,
    totalMustHold: mustHoldItems.length,
    coveredMustHold: coveredMustHoldItems.length,
    uncoveredMustHold: uncoveredMustHoldItems,
    totalScenarios: minimumCoverage.length,
    implementedScenarios: implementedScenarioCount,
    scaffoldScenarios: scaffoldScenarioCount,
    uncoveredScenarios: uncoveredScenarioList,
    uncoveredBranches,
  };
}

// ---------------------------------------------------------------------------
// Main pipeline coordinator
// ---------------------------------------------------------------------------

export async function evaluatePolicyCoverage(
  input: EvaluatePolicyCoverageInput = {},
): Promise<EvaluatePolicyCoverageOutput> {
  const repoRoot = await findRepositoryRoot(input.repoRoot ?? process.cwd());
  const { config: toolingConfig } = await loadToolingConfig(repoRoot);

  const warnings: string[] = [];

  // Stage 1: resolve changed files, map to flows, load configs
  const resolved = await resolveChangedFilesAndFlows(input, repoRoot, toolingConfig);
  warnings.push(...resolved.warnings);

  const { changedFiles, fileToFlows, impactedFlowIds, flowsRecord, resolvedPolicyPath, flowSpecMapConfig } =
    resolved.result;

  // Load coverage report
  const coverageReportPath = resolveFromRepoRoot(
    repoRoot,
    input.coverageReportPath ?? toolingConfig.playwright.coverageReportPath,
  );
  const coverageData = await loadCoverageReport(coverageReportPath, warnings);
  if (!coverageData) {
    warnings.push(
      `Coverage report not found at '${coverageReportPath}'. Branch coverage will be reported as 0%. ` +
        "Run Playwright tests with coverage enabled to generate it.",
    );
  }

  // Stage 2: evaluate each impacted flow
  const flowScores: FlowCoverageScore[] = [];

  for (const flowId of impactedFlowIds) {
    const flowPolicy = asObjectRecord(flowsRecord[flowId]);
    if (!flowPolicy) {
      warnings.push(`Flow '${flowId}' has no policy definition; skipping coverage evaluation.`);
      continue;
    }

    const score = await evaluateFlowScore(
      flowId,
      flowPolicy,
      flowSpecMapConfig,
      repoRoot,
      fileToFlows,
      changedFiles,
      coverageData,
    );
    flowScores.push(score);
  }

  // Stage 3: aggregate results
  const overallScore =
    flowScores.length > 0
      ? Math.round(flowScores.reduce((sum, fs) => sum + fs.overallScore, 0) / flowScores.length)
      : 100;

  const coverageGatePassed = overallScore >= COVERAGE_GATE_THRESHOLD;
  const riskLevel = deriveCoverageRiskLevel(overallScore);

  // Derive recommended actions
  const recommendedActions: string[] = [];

  for (const fs of flowScores) {
    if (fs.uncoveredScenarios.length > 0) {
      recommendedActions.push(
        `Implement Playwright tests for uncovered scenarios in flow '${fs.flowId}': ${fs.uncoveredScenarios.join(", ")}.`,
      );
    }

    if (fs.scaffoldScenarios > 0) {
      recommendedActions.push(
        `Promote ${fs.scaffoldScenarios} scaffold test(s) to implemented in flow '${fs.flowId}'.`,
      );
    }

    if (fs.uncoveredMustHold.length > 0) {
      recommendedActions.push(
        `Add tests covering must-hold invariants in flow '${fs.flowId}': ${fs.uncoveredMustHold.join(", ")}.`,
      );
    }

    if (fs.branchCoverage < 50 && fs.branchCoverage > 0) {
      recommendedActions.push(
        `Improve branch coverage for flow '${fs.flowId}' (currently ${fs.branchCoverage}%, target >= 50%).`,
      );
    }
  }

  if (flowScores.length === 0 && impactedFlowIds.length > 0) {
    recommendedActions.push(
      "No flow scores could be computed; check that policy definitions exist for impacted flows.",
    );
  }

  if (recommendedActions.length === 0) {
    recommendedActions.push("Policy coverage is adequate. Maintain current coverage levels.");
  }

  return {
    tool: "evaluate_policy_coverage",
    version: 1,
    generatedAt: new Date().toISOString(),
    repoRoot,
    policyPath: resolvedPolicyPath,
    inputs: {
      changedFiles,
      impactedFlowIds,
    },
    flowScores,
    overallScore,
    coverageGatePassed,
    coverageGateThreshold: COVERAGE_GATE_THRESHOLD,
    riskLevel,
    recommendedActions: toSortedUnique(recommendedActions),
    warnings: toSortedUnique(warnings),
  };
}
