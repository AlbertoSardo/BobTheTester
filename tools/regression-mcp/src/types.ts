export type ToolName =
  | "get_changed_files"
  | "map_impacted_flows"
  | "list_relevant_playwright_specs"
  | "generate_playwright_suite"
  | "validate_playwright_suite"
  | "run_playwright"
  | "read_playwright_report"
  | "collect_artifacts"
  | "suggest_missing_tests"
  | "suggest_policy_clarifications"
  | "read_business_review_policy"
  | "generate_code_review_report"
  | "generate_unified_review"
  | "generate_regression_review";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface JsonSchema {
  [key: string]: JsonValue;
}

export interface ToolDefinition<TInput, TOutput> {
  name: ToolName;
  description: string;
  inputSchema: JsonSchema;
  handler: (input: TInput) => Promise<TOutput>;
}

export interface FlowMapEntry {
  flowId: string;
  filePatterns: string[];
}

export interface FlowMapConfig {
  version: number;
  mappings: FlowMapEntry[];
}

export interface FlowSpecMapConfig {
  version: number;
  flowToSpecs: Record<string, string[]>;
}

export interface ToolingConfig {
  version: number;
  git: {
    defaultBaseRef: string;
    defaultHeadRef: string;
  };
  playwright: {
    command: string;
    commandArgs: string[];
    defaultProject: string;
    configFile: string;
    reportFormat: "json" | "junit" | "line";
    reportPath: string;
    testResultsDir: string;
    htmlReportDir: string;
    tracesDir: string;
    resultsDir: string;
  };
}

export interface BaseToolResponse {
  tool: ToolName;
  warnings: string[];
}

export interface GetChangedFilesInput {
  baseRef?: string;
  headRef?: string;
  includeUntracked?: boolean;
  repoRoot?: string;
}

export interface GetChangedFilesOutput extends BaseToolResponse {
  tool: "get_changed_files";
  repoRoot: string;
  baseRef: string;
  headRef: string;
  changedFiles: string[];
  untrackedFiles: string[];
}

export interface MapImpactedFlowsInput {
  changedFiles: string[];
  flowMapPath?: string;
  repoRoot?: string;
}

export interface MapImpactedFlowsOutput extends BaseToolResponse {
  tool: "map_impacted_flows";
  flowMapPath: string;
  impactedFlowIds: string[];
  fileToFlows: Record<string, string[]>;
  unmappedFiles: string[];
}

export interface ListRelevantPlaywrightSpecsInput {
  impactedFlowIds: string[];
  flowSpecMapPath?: string;
  repoRoot?: string;
}

export interface ListRelevantPlaywrightSpecsOutput extends BaseToolResponse {
  tool: "list_relevant_playwright_specs";
  flowSpecMapPath: string;
  resolvedSpecs: string[];
  flowToSpecs: Record<string, string[]>;
  flowsWithoutSpecs: string[];
}

export interface GeneratePlaywrightSuiteInput {
  flows?: string[];
  updateMapping?: boolean;
  policyPath?: string;
  flowSpecMapPath?: string;
  repoRoot?: string;
}

export interface GeneratePlaywrightSuiteOutput extends BaseToolResponse {
  tool: "generate_playwright_suite";
  policyPath: string;
  flowSpecMapPath: string;
  targetFlows: string[];
  createdSpecFiles: string[];
  updatedSpecFiles: string[];
  unchangedSpecFiles: string[];
  mappingUpdated: boolean;
  generatedTestsByFlow: Record<string, string[]>;
}

export interface ValidatePlaywrightSuiteInput {
  flows?: string[];
  policyPath?: string;
  flowSpecMapPath?: string;
  repoRoot?: string;
}

export interface ValidatePlaywrightSuiteFlowResult {
  flowId: string;
  requiredScenarios: string[];
  coveredScenarios: string[];
  missingScenarios: string[];
  implementedScenarios: string[];
  scaffoldScenarios: string[];
  implementedScenarioIds: string[];
  scaffoldScenarioIds: string[];
  mappedSpecs: string[];
  missingSpecFiles: string[];
}

export interface ValidatePlaywrightSuiteOutput extends BaseToolResponse {
  tool: "validate_playwright_suite";
  policyPath: string;
  flowSpecMapPath: string;
  targetFlows: string[];
  isComplete: boolean;
  incompleteFlows: string[];
  scaffoldFlows: string[];
  flowResults: ValidatePlaywrightSuiteFlowResult[];
}

export interface RunPlaywrightInput {
  specs: string[];
  dryRun?: boolean;
  headed?: boolean;
  browser?: string;
  configFile?: string;
  reportPath?: string;
  reportFormat?: "json" | "junit" | "line";
  extraArgs?: string[];
  repoRoot?: string;
}

export interface RunPlaywrightOutput extends BaseToolResponse {
  tool: "run_playwright";
  dryRun: boolean;
  command: string[];
  cwd: string;
  specs: string[];
  reportPath: string;
  reportFormat: "json" | "junit" | "line";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  exitCode: number | null;
  status: "skipped" | "passed" | "failed";
  stdout: string;
  stderr: string;
}

export interface ReadPlaywrightReportInput {
  reportPath?: string;
  reportFormat?: "json" | "junit" | "line";
  repoRoot?: string;
}

export interface ReadPlaywrightReportOutput extends BaseToolResponse {
  tool: "read_playwright_report";
  reportPath: string;
  reportFormat: "json" | "junit" | "line";
  status: "parsed" | "missing" | "invalid" | "stub" | "unsupported-format";
  totals: {
    tests: number;
    passed: number;
    failed: number;
    skipped: number;
    pending: number;
    durationMs: number;
  };
  failures: string[];
  failedSpecFiles: string[];
}

export interface CollectArtifactsInput {
  screenshotsDir?: string;
  videosDir?: string;
  resultsDir?: string;
  reportPath?: string;
  repoRoot?: string;
}

export interface CollectArtifactsOutput extends BaseToolResponse {
  tool: "collect_artifacts";
  screenshots: string[];
  failedScreenshots: string[];
  videos: string[];
  failedVideos: string[];
  reports: string[];
  missingDirectories: string[];
}

export interface SuggestMissingTestsInput {
  impactedFlowIds: string[];
  unmappedFiles: string[];
  flowSpecMapPath?: string;
  repoRoot?: string;
}

export interface SuggestMissingTestsOutput extends BaseToolResponse {
  tool: "suggest_missing_tests";
  flowsWithoutSpecs: string[];
  unmappedFiles: string[];
  suggestions: string[];
}

export type ClarificationPriority = "high" | "medium" | "low";

export interface ClarificationQuestion {
  id: string;
  flowId?: string;
  priority: ClarificationPriority;
  blocking: boolean;
  question: string;
  rationale: string;
}

export interface SuggestPolicyClarificationsInput {
  flows?: string[];
  policyPath?: string;
  flowMapPath?: string;
  flowSpecMapPath?: string;
  repoRoot?: string;
}

export interface SuggestPolicyClarificationsOutput extends BaseToolResponse {
  tool: "suggest_policy_clarifications";
  policyPath: string;
  flowMapPath: string;
  flowSpecMapPath: string;
  targetFlows: string[];
  questions: ClarificationQuestion[];
}

export interface ReadBusinessReviewPolicyInput {
  policyPath?: string;
  repoRoot?: string;
}

export interface ReadBusinessReviewPolicyOutput extends BaseToolResponse {
  tool: "read_business_review_policy";
  policyPath: string;
  policyVersion: number | null;
  flowIds: string[];
  policy: { [key: string]: JsonValue };
}

export type ScenarioImplementationStatus = "scaffold" | "implemented";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type CodeReviewFindingCategory = "sensitive-path" | "added-line-check" | "diff-size";

export type CodeReviewFindingSeverity = "low" | "medium" | "high";

export interface CodeReviewReportInput {
  baseRef?: string;
  headRef?: string;
  includeUntracked?: boolean;
  changedFiles?: string[];
  policyPath?: string;
  repoRoot?: string;
}

export interface CodeReviewFinding {
  ruleId: string;
  category: CodeReviewFindingCategory;
  severity: CodeReviewFindingSeverity;
  filePath: string;
  lineNumber?: number;
  message: string;
  evidence: string;
}

export interface CodeReviewReportOutput extends BaseToolResponse {
  tool: "generate_code_review_report";
  version: number;
  generatedAt: string;
  repoRoot: string;
  policyPath: string;
  inputs: {
    baseRef?: string;
    headRef?: string;
    includeUntracked: boolean;
    changedFiles: string[];
  };
  changedFiles: string[];
  summary: {
    totalFiles: number;
    byExtension: Record<string, number>;
    totalAddedLines: number;
    totalRemovedLines: number;
    perFile: Array<{
      filePath: string;
      addedLines: number;
      removedLines: number;
      totalChangedLines: number;
    }>;
  };
  findings: {
    sensitivePathChanges: CodeReviewFinding[];
    addedLineFindings: CodeReviewFinding[];
    oversizedChangeFindings: CodeReviewFinding[];
  };
  findingCounts: {
    low: number;
    medium: number;
    high: number;
    total: number;
  };
  riskLevel: RiskLevel;
  recommendedActions: string[];
}

export interface RegressionReviewInput {
  baseRef?: string;
  headRef?: string;
  includeUntracked?: boolean;
  changedFiles?: string[];
  policyPath?: string;
  flowMapPath?: string;
  flowSpecMapPath?: string;
  dryRun?: boolean;
  headed?: boolean;
  browser?: string;
  configFile?: string;
  reportPath?: string;
  reportFormat?: "json" | "junit" | "line";
  extraArgs?: string[];
  repoRoot?: string;
}

export interface RegressionReviewOutput {
  version: number;
  generatedAt: string;
  repoRoot: string;
  inputs: {
    baseRef?: string;
    headRef?: string;
    includeUntracked: boolean;
    changedFiles: string[];
    dryRun: boolean;
  };
  mapping: {
    fileToFlows: Record<string, string[]>;
    unmappedFiles: string[];
  };
  impactedFlows: string[];
  suiteGeneration: {
    targetFlows: string[];
    createdSpecFiles: string[];
    updatedSpecFiles: string[];
    unchangedSpecFiles: string[];
    mappingUpdated: boolean;
  };
  selectedSpecs: string[];
  passFailSummary: {
    runnerStatus: "skipped" | "passed" | "failed";
    exitCode: number | null;
    totals: {
      tests: number;
      passed: number;
      failed: number;
      skipped: number;
      pending: number;
      durationMs: number;
    };
  };
  failedTests: string[];
  artifactPaths: {
    screenshots: string[];
    failedScreenshots: string[];
    videos: string[];
    failedVideos: string[];
    reports: string[];
  };
  suggestedMissingTests: {
    flowsWithoutSpecs: string[];
    unmappedFiles: string[];
    suggestions: string[];
  };
  clarificationQuestions: ClarificationQuestion[];
  suiteCompleteness: {
    isComplete: boolean;
    incompleteFlows: string[];
    scaffoldFlows: string[];
  };
  riskLevel: RiskLevel;
  execution: {
    command: string[];
    reportPath: string;
    reportFormat: "json" | "junit" | "line";
    startedAt: string;
    finishedAt: string;
    durationMs: number;
  };
  warnings: string[];
}

export interface UnifiedReviewInput extends RegressionReviewInput {
  regressionPolicyPath?: string;
  codeReviewPolicyPath?: string;
}

export interface UnifiedReviewOutput extends BaseToolResponse {
  tool: "generate_unified_review";
  version: number;
  generatedAt: string;
  repoRoot: string;
  inputs: {
    baseRef?: string;
    headRef?: string;
    includeUntracked: boolean;
    changedFiles: string[];
    dryRun: boolean;
  };
  regressionReview: RegressionReviewOutput;
  codeReview: CodeReviewReportOutput;
  overallRiskLevel: RiskLevel;
  overallRecommendedActions: string[];
  qualityGates: {
    suiteCompletenessGatePassed: boolean;
    codeReviewRiskGatePassed: boolean;
    regressionRiskGatePassed: boolean;
    combinedGatePassed: boolean;
  };
}
