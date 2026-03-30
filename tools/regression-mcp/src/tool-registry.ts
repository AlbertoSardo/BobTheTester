import { generatePlaywrightSuite } from "./tools/generate-playwright-suite.js";
import { collectArtifacts } from "./tools/collect-artifacts.js";
import { generateCodeReviewReport } from "./tools/generate-code-review-report.js";
import { getChangedFiles } from "./tools/get-changed-files.js";
import { listRelevantPlaywrightSpecs } from "./tools/list-relevant-playwright-specs.js";
import { mapImpactedFlows } from "./tools/map-impacted-flows.js";
import { readBusinessReviewPolicy } from "./tools/read-business-review-policy.js";
import { readPlaywrightReport } from "./tools/read-playwright-report.js";
import { generateRegressionReview } from "./review.js";
import { suggestPolicyClarifications } from "./tools/suggest-policy-clarifications.js";
import { generateUnifiedReview } from "./unified-review.js";
import { runPlaywright } from "./tools/run-playwright.js";
import { suggestMissingTests } from "./tools/suggest-missing-tests.js";
import { validatePlaywrightSuite } from "./tools/validate-playwright-suite.js";
import type {
  CodeReviewReportInput,
  CollectArtifactsInput,
  GeneratePlaywrightSuiteInput,
  GetChangedFilesInput,
  JsonSchema,
  ListRelevantPlaywrightSpecsInput,
  MapImpactedFlowsInput,
  ReadBusinessReviewPolicyInput,
  ReadPlaywrightReportInput,
  RegressionReviewInput,
  RunPlaywrightInput,
  SuggestPolicyClarificationsInput,
  SuggestMissingTestsInput,
  ToolName,
  UnifiedReviewInput,
  ValidatePlaywrightSuiteInput,
} from "./types.js";

export interface RegisteredTool {
  name: ToolName;
  description: string;
  inputSchema: JsonSchema;
  handler: (input: Record<string, unknown>) => Promise<unknown>;
}

function readOptionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  if (typeof value === "undefined") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`Expected '${key}' to be a string.`);
  }
  return value;
}

function readOptionalBoolean(input: Record<string, unknown>, key: string): boolean | undefined {
  const value = input[key];
  if (typeof value === "undefined") {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`Expected '${key}' to be a boolean.`);
  }
  return value;
}

function readRequiredStringArray(input: Record<string, unknown>, key: string): string[] {
  const value = input[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Expected '${key}' to be an array of strings.`);
  }
  return value;
}

function readOptionalStringArray(input: Record<string, unknown>, key: string): string[] | undefined {
  const value = input[key];
  if (typeof value === "undefined") {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Expected '${key}' to be an array of strings.`);
  }
  return value;
}

function toGetChangedFilesInput(input: Record<string, unknown>): GetChangedFilesInput {
  return {
    baseRef: readOptionalString(input, "baseRef"),
    headRef: readOptionalString(input, "headRef"),
    includeUntracked: readOptionalBoolean(input, "includeUntracked"),
    repoRoot: readOptionalString(input, "repoRoot"),
  };
}

function toCodeReviewReportInput(input: Record<string, unknown>): CodeReviewReportInput {
  return {
    baseRef: readOptionalString(input, "baseRef"),
    headRef: readOptionalString(input, "headRef"),
    includeUntracked: readOptionalBoolean(input, "includeUntracked"),
    changedFiles: readOptionalStringArray(input, "changedFiles"),
    policyPath: readOptionalString(input, "policyPath"),
    repoRoot: readOptionalString(input, "repoRoot"),
  };
}

function toMapImpactedFlowsInput(input: Record<string, unknown>): MapImpactedFlowsInput {
  return {
    changedFiles: readRequiredStringArray(input, "changedFiles"),
    flowMapPath: readOptionalString(input, "flowMapPath"),
    repoRoot: readOptionalString(input, "repoRoot"),
  };
}

function toListRelevantPlaywrightSpecsInput(
  input: Record<string, unknown>,
): ListRelevantPlaywrightSpecsInput {
  return {
    impactedFlowIds: readRequiredStringArray(input, "impactedFlowIds"),
    flowSpecMapPath: readOptionalString(input, "flowSpecMapPath"),
    repoRoot: readOptionalString(input, "repoRoot"),
  };
}

function toGeneratePlaywrightSuiteInput(input: Record<string, unknown>): GeneratePlaywrightSuiteInput {
  return {
    flows: readOptionalStringArray(input, "flows"),
    updateMapping: readOptionalBoolean(input, "updateMapping"),
    policyPath: readOptionalString(input, "policyPath"),
    flowSpecMapPath: readOptionalString(input, "flowSpecMapPath"),
    repoRoot: readOptionalString(input, "repoRoot"),
  };
}

function toValidatePlaywrightSuiteInput(input: Record<string, unknown>): ValidatePlaywrightSuiteInput {
  return {
    flows: readOptionalStringArray(input, "flows"),
    policyPath: readOptionalString(input, "policyPath"),
    flowSpecMapPath: readOptionalString(input, "flowSpecMapPath"),
    repoRoot: readOptionalString(input, "repoRoot"),
  };
}

function toRunPlaywrightInput(input: Record<string, unknown>): RunPlaywrightInput {
  const reportFormat = readOptionalString(input, "reportFormat");
  if (
    typeof reportFormat !== "undefined" &&
    reportFormat !== "json" &&
    reportFormat !== "junit" &&
    reportFormat !== "line"
  ) {
    throw new Error("Expected 'reportFormat' to be one of: json, junit, line.");
  }

  return {
    specs: readRequiredStringArray(input, "specs"),
    dryRun: readOptionalBoolean(input, "dryRun"),
    headed: readOptionalBoolean(input, "headed"),
    browser: readOptionalString(input, "browser"),
    configFile: readOptionalString(input, "configFile"),
    reportPath: readOptionalString(input, "reportPath"),
    reportFormat,
    extraArgs: readOptionalStringArray(input, "extraArgs"),
    repoRoot: readOptionalString(input, "repoRoot"),
  };
}

function toReadPlaywrightReportInput(input: Record<string, unknown>): ReadPlaywrightReportInput {
  const reportFormat = readOptionalString(input, "reportFormat");
  if (
    typeof reportFormat !== "undefined" &&
    reportFormat !== "json" &&
    reportFormat !== "junit" &&
    reportFormat !== "line"
  ) {
    throw new Error("Expected 'reportFormat' to be one of: json, junit, line.");
  }

  return {
    reportPath: readOptionalString(input, "reportPath"),
    reportFormat,
    repoRoot: readOptionalString(input, "repoRoot"),
  };
}

function toCollectArtifactsInput(input: Record<string, unknown>): CollectArtifactsInput {
  return {
    screenshotsDir: readOptionalString(input, "screenshotsDir"),
    videosDir: readOptionalString(input, "videosDir"),
    resultsDir: readOptionalString(input, "resultsDir"),
    reportPath: readOptionalString(input, "reportPath"),
    repoRoot: readOptionalString(input, "repoRoot"),
  };
}

function toSuggestMissingTestsInput(input: Record<string, unknown>): SuggestMissingTestsInput {
  return {
    impactedFlowIds: readRequiredStringArray(input, "impactedFlowIds"),
    unmappedFiles: readRequiredStringArray(input, "unmappedFiles"),
    flowSpecMapPath: readOptionalString(input, "flowSpecMapPath"),
    repoRoot: readOptionalString(input, "repoRoot"),
  };
}

function toSuggestPolicyClarificationsInput(
  input: Record<string, unknown>,
): SuggestPolicyClarificationsInput {
  return {
    flows: readOptionalStringArray(input, "flows"),
    policyPath: readOptionalString(input, "policyPath"),
    flowMapPath: readOptionalString(input, "flowMapPath"),
    flowSpecMapPath: readOptionalString(input, "flowSpecMapPath"),
    repoRoot: readOptionalString(input, "repoRoot"),
  };
}

function toReadBusinessReviewPolicyInput(input: Record<string, unknown>): ReadBusinessReviewPolicyInput {
  return {
    policyPath: readOptionalString(input, "policyPath"),
    repoRoot: readOptionalString(input, "repoRoot"),
  };
}

function toRegressionReviewInput(input: Record<string, unknown>): RegressionReviewInput {
  const reportFormat = readOptionalString(input, "reportFormat");
  if (
    typeof reportFormat !== "undefined" &&
    reportFormat !== "json" &&
    reportFormat !== "junit" &&
    reportFormat !== "line"
  ) {
    throw new Error("Expected 'reportFormat' to be one of: json, junit, line.");
  }

  return {
    baseRef: readOptionalString(input, "baseRef"),
    headRef: readOptionalString(input, "headRef"),
    includeUntracked: readOptionalBoolean(input, "includeUntracked"),
    changedFiles: readOptionalStringArray(input, "changedFiles"),
    policyPath: readOptionalString(input, "policyPath"),
    flowMapPath: readOptionalString(input, "flowMapPath"),
    flowSpecMapPath: readOptionalString(input, "flowSpecMapPath"),
    dryRun: readOptionalBoolean(input, "dryRun"),
    headed: readOptionalBoolean(input, "headed"),
    browser: readOptionalString(input, "browser"),
    configFile: readOptionalString(input, "configFile"),
    reportPath: readOptionalString(input, "reportPath"),
    reportFormat,
    extraArgs: readOptionalStringArray(input, "extraArgs"),
    repoRoot: readOptionalString(input, "repoRoot"),
  };
}

function toUnifiedReviewInput(input: Record<string, unknown>): UnifiedReviewInput {
  const reportFormat = readOptionalString(input, "reportFormat");
  if (
    typeof reportFormat !== "undefined" &&
    reportFormat !== "json" &&
    reportFormat !== "junit" &&
    reportFormat !== "line"
  ) {
    throw new Error("Expected 'reportFormat' to be one of: json, junit, line.");
  }

  return {
    baseRef: readOptionalString(input, "baseRef"),
    headRef: readOptionalString(input, "headRef"),
    includeUntracked: readOptionalBoolean(input, "includeUntracked"),
    changedFiles: readOptionalStringArray(input, "changedFiles"),
    policyPath: readOptionalString(input, "policyPath"),
    regressionPolicyPath: readOptionalString(input, "regressionPolicyPath"),
    codeReviewPolicyPath: readOptionalString(input, "codeReviewPolicyPath"),
    flowMapPath: readOptionalString(input, "flowMapPath"),
    flowSpecMapPath: readOptionalString(input, "flowSpecMapPath"),
    dryRun: readOptionalBoolean(input, "dryRun"),
    headed: readOptionalBoolean(input, "headed"),
    browser: readOptionalString(input, "browser"),
    configFile: readOptionalString(input, "configFile"),
    reportPath: readOptionalString(input, "reportPath"),
    reportFormat,
    extraArgs: readOptionalStringArray(input, "extraArgs"),
    repoRoot: readOptionalString(input, "repoRoot"),
  };
}

export const registeredTools: RegisteredTool[] = [
  {
    name: "get_changed_files",
    description: "Returns changed files for a git range.",
    inputSchema: {
      type: "object",
      properties: {
        baseRef: { type: "string" },
        headRef: { type: "string" },
        includeUntracked: { type: "boolean" },
        repoRoot: { type: "string" },
      },
      additionalProperties: false,
    },
    handler: async (input) => getChangedFiles(toGetChangedFilesInput(input)),
  },
  {
    name: "map_impacted_flows",
    description: "Maps changed files to business flows via static config.",
    inputSchema: {
      type: "object",
      properties: {
        changedFiles: {
          type: "array",
          items: { type: "string" },
        },
        flowMapPath: { type: "string" },
        repoRoot: { type: "string" },
      },
      required: ["changedFiles"],
      additionalProperties: false,
    },
    handler: async (input) => mapImpactedFlows(toMapImpactedFlowsInput(input)),
  },
  {
    name: "list_relevant_playwright_specs",
    description: "Resolves impacted flow IDs to Playwright specs via static config.",
    inputSchema: {
      type: "object",
      properties: {
        impactedFlowIds: {
          type: "array",
          items: { type: "string" },
        },
        flowSpecMapPath: { type: "string" },
        repoRoot: { type: "string" },
      },
      required: ["impactedFlowIds"],
      additionalProperties: false,
    },
    handler: async (input) => listRelevantPlaywrightSpecs(toListRelevantPlaywrightSpecsInput(input)),
  },
  {
    name: "generate_playwright_suite",
    description: "Generates or updates Playwright suite coverage from business policy.",
    inputSchema: {
      type: "object",
      properties: {
        flows: {
          type: "array",
          items: { type: "string" },
        },
        updateMapping: { type: "boolean" },
        policyPath: { type: "string" },
        flowSpecMapPath: { type: "string" },
        repoRoot: { type: "string" },
      },
      additionalProperties: false,
    },
    handler: async (input) => generatePlaywrightSuite(toGeneratePlaywrightSuiteInput(input)),
  },
  {
    name: "validate_playwright_suite",
    description: "Validates Playwright suite completeness against business policy coverage.",
    inputSchema: {
      type: "object",
      properties: {
        flows: {
          type: "array",
          items: { type: "string" },
        },
        policyPath: { type: "string" },
        flowSpecMapPath: { type: "string" },
        repoRoot: { type: "string" },
      },
      additionalProperties: false,
    },
    handler: async (input) => validatePlaywrightSuite(toValidatePlaywrightSuiteInput(input)),
  },
  {
    name: "run_playwright",
    description: "Runs Playwright for selected specs (dry-run by default).",
    inputSchema: {
      type: "object",
      properties: {
        specs: {
          type: "array",
          items: { type: "string" },
        },
        dryRun: { type: "boolean" },
        headed: { type: "boolean" },
        browser: { type: "string" },
        configFile: { type: "string" },
        reportPath: { type: "string" },
        reportFormat: {
          type: "string",
          enum: ["json", "junit", "line"],
        },
        extraArgs: {
          type: "array",
          items: { type: "string" },
        },
        repoRoot: { type: "string" },
      },
      required: ["specs"],
      additionalProperties: false,
    },
    handler: async (input) => runPlaywright(toRunPlaywrightInput(input)),
  },
  {
    name: "read_playwright_report",
    description: "Reads and normalizes Playwright report output.",
    inputSchema: {
      type: "object",
      properties: {
        reportPath: { type: "string" },
        reportFormat: {
          type: "string",
          enum: ["json", "junit", "line"],
        },
        repoRoot: { type: "string" },
      },
      additionalProperties: false,
    },
    handler: async (input) => readPlaywrightReport(toReadPlaywrightReportInput(input)),
  },
  {
    name: "collect_artifacts",
    description: "Collects test artifacts from configured directories.",
    inputSchema: {
      type: "object",
      properties: {
        screenshotsDir: { type: "string" },
        videosDir: { type: "string" },
        resultsDir: { type: "string" },
        reportPath: { type: "string" },
        repoRoot: { type: "string" },
      },
      additionalProperties: false,
    },
    handler: async (input) => collectArtifacts(toCollectArtifactsInput(input)),
  },
  {
    name: "suggest_missing_tests",
    description: "Suggests missing mappings and missing Playwright coverage.",
    inputSchema: {
      type: "object",
      properties: {
        impactedFlowIds: {
          type: "array",
          items: { type: "string" },
        },
        unmappedFiles: {
          type: "array",
          items: { type: "string" },
        },
        flowSpecMapPath: { type: "string" },
        repoRoot: { type: "string" },
      },
      required: ["impactedFlowIds", "unmappedFiles"],
      additionalProperties: false,
    },
    handler: async (input) => suggestMissingTests(toSuggestMissingTestsInput(input)),
  },
  {
    name: "suggest_policy_clarifications",
    description:
      "Returns deterministic clarification questions when business-policy execution details are unclear.",
    inputSchema: {
      type: "object",
      properties: {
        flows: {
          type: "array",
          items: { type: "string" },
        },
        policyPath: { type: "string" },
        flowMapPath: { type: "string" },
        flowSpecMapPath: { type: "string" },
        repoRoot: { type: "string" },
      },
      additionalProperties: false,
    },
    handler: async (input) => suggestPolicyClarifications(toSuggestPolicyClarificationsInput(input)),
  },
  {
    name: "read_business_review_policy",
    description: "Reads deterministic business and conceptual review policy.",
    inputSchema: {
      type: "object",
      properties: {
        policyPath: { type: "string" },
        repoRoot: { type: "string" },
      },
      additionalProperties: false,
    },
    handler: async (input) => readBusinessReviewPolicy(toReadBusinessReviewPolicyInput(input)),
  },
  {
    name: "generate_code_review_report",
    description: "Runs deterministic code-review checks and returns structured findings.",
    inputSchema: {
      type: "object",
      properties: {
        baseRef: { type: "string" },
        headRef: { type: "string" },
        includeUntracked: { type: "boolean" },
        changedFiles: {
          type: "array",
          items: { type: "string" },
        },
        policyPath: { type: "string" },
        repoRoot: { type: "string" },
      },
      additionalProperties: false,
    },
    handler: async (input) => generateCodeReviewReport(toCodeReviewReportInput(input)),
  },
  {
    name: "generate_regression_review",
    description: "Runs deterministic end-to-end regression review workflow.",
    inputSchema: {
      type: "object",
      properties: {
        baseRef: { type: "string" },
        headRef: { type: "string" },
        includeUntracked: { type: "boolean" },
        changedFiles: {
          type: "array",
          items: { type: "string" },
        },
        policyPath: { type: "string" },
        flowMapPath: { type: "string" },
        flowSpecMapPath: { type: "string" },
        dryRun: { type: "boolean" },
        headed: { type: "boolean" },
        browser: { type: "string" },
        configFile: { type: "string" },
        reportPath: { type: "string" },
        reportFormat: {
          type: "string",
          enum: ["json", "junit", "line"],
        },
        extraArgs: {
          type: "array",
          items: { type: "string" },
        },
        repoRoot: { type: "string" },
      },
      additionalProperties: false,
    },
    handler: async (input) => generateRegressionReview(toRegressionReviewInput(input)),
  },
  {
    name: "generate_unified_review",
    description: "Runs regression and code-review tools and returns one deterministic combined report.",
    inputSchema: {
      type: "object",
      properties: {
        baseRef: { type: "string" },
        headRef: { type: "string" },
        includeUntracked: { type: "boolean" },
        changedFiles: {
          type: "array",
          items: { type: "string" },
        },
        policyPath: { type: "string" },
        regressionPolicyPath: { type: "string" },
        codeReviewPolicyPath: { type: "string" },
        flowMapPath: { type: "string" },
        flowSpecMapPath: { type: "string" },
        dryRun: { type: "boolean" },
        headed: { type: "boolean" },
        browser: { type: "string" },
        configFile: { type: "string" },
        reportPath: { type: "string" },
        reportFormat: {
          type: "string",
          enum: ["json", "junit", "line"],
        },
        extraArgs: {
          type: "array",
          items: { type: "string" },
        },
        repoRoot: { type: "string" },
      },
      additionalProperties: false,
    },
    handler: async (input) => generateUnifiedReview(toUnifiedReviewInput(input)),
  },
];

export function findTool(name: string): RegisteredTool | undefined {
  return registeredTools.find((tool) => tool.name === name);
}
