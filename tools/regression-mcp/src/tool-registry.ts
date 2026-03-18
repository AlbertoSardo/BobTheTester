import { generateCypressSuite } from "./tools/generate-cypress-suite.js";
import { collectArtifacts } from "./tools/collect-artifacts.js";
import { generateCodeReviewReport } from "./tools/generate-code-review-report.js";
import { getChangedFiles } from "./tools/get-changed-files.js";
import { listRelevantCypressSpecs } from "./tools/list-relevant-cypress-specs.js";
import { mapImpactedFlows } from "./tools/map-impacted-flows.js";
import { readBusinessReviewPolicy } from "./tools/read-business-review-policy.js";
import { readCypressReport } from "./tools/read-cypress-report.js";
import { generateRegressionReview } from "./review.js";
import { generateUnifiedReview } from "./unified-review.js";
import { runCypress } from "./tools/run-cypress.js";
import { suggestMissingTests } from "./tools/suggest-missing-tests.js";
import { validateCypressSuite } from "./tools/validate-cypress-suite.js";
import type {
  CodeReviewReportInput,
  CollectArtifactsInput,
  GenerateCypressSuiteInput,
  GetChangedFilesInput,
  JsonSchema,
  ListRelevantCypressSpecsInput,
  MapImpactedFlowsInput,
  ReadBusinessReviewPolicyInput,
  ReadCypressReportInput,
  RegressionReviewInput,
  RunCypressInput,
  SuggestMissingTestsInput,
  ToolName,
  UnifiedReviewInput,
  ValidateCypressSuiteInput,
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

function toListRelevantCypressSpecsInput(
  input: Record<string, unknown>,
): ListRelevantCypressSpecsInput {
  return {
    impactedFlowIds: readRequiredStringArray(input, "impactedFlowIds"),
    flowSpecMapPath: readOptionalString(input, "flowSpecMapPath"),
    repoRoot: readOptionalString(input, "repoRoot"),
  };
}

function toGenerateCypressSuiteInput(input: Record<string, unknown>): GenerateCypressSuiteInput {
  return {
    flows: readOptionalStringArray(input, "flows"),
    updateMapping: readOptionalBoolean(input, "updateMapping"),
    policyPath: readOptionalString(input, "policyPath"),
    flowSpecMapPath: readOptionalString(input, "flowSpecMapPath"),
    repoRoot: readOptionalString(input, "repoRoot"),
  };
}

function toValidateCypressSuiteInput(input: Record<string, unknown>): ValidateCypressSuiteInput {
  return {
    flows: readOptionalStringArray(input, "flows"),
    policyPath: readOptionalString(input, "policyPath"),
    flowSpecMapPath: readOptionalString(input, "flowSpecMapPath"),
    repoRoot: readOptionalString(input, "repoRoot"),
  };
}

function toRunCypressInput(input: Record<string, unknown>): RunCypressInput {
  const reportFormat = readOptionalString(input, "reportFormat");
  if (
    typeof reportFormat !== "undefined" &&
    reportFormat !== "json" &&
    reportFormat !== "junit" &&
    reportFormat !== "text"
  ) {
    throw new Error("Expected 'reportFormat' to be one of: json, junit, text.");
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

function toReadCypressReportInput(input: Record<string, unknown>): ReadCypressReportInput {
  const reportFormat = readOptionalString(input, "reportFormat");
  if (
    typeof reportFormat !== "undefined" &&
    reportFormat !== "json" &&
    reportFormat !== "junit" &&
    reportFormat !== "text"
  ) {
    throw new Error("Expected 'reportFormat' to be one of: json, junit, text.");
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

function toReadBusinessReviewPolicyInput(
  input: Record<string, unknown>,
): ReadBusinessReviewPolicyInput {
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
    reportFormat !== "text"
  ) {
    throw new Error("Expected 'reportFormat' to be one of: json, junit, text.");
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
    reportFormat !== "text"
  ) {
    throw new Error("Expected 'reportFormat' to be one of: json, junit, text.");
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
    name: "list_relevant_cypress_specs",
    description: "Resolves impacted flow IDs to Cypress specs via static config.",
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
    handler: async (input) => listRelevantCypressSpecs(toListRelevantCypressSpecsInput(input)),
  },
  {
    name: "generate_cypress_suite",
    description: "Generates or updates Cypress suite coverage from business policy.",
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
    handler: async (input) => generateCypressSuite(toGenerateCypressSuiteInput(input)),
  },
  {
    name: "validate_cypress_suite",
    description: "Validates Cypress suite completeness against business policy coverage.",
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
    handler: async (input) => validateCypressSuite(toValidateCypressSuiteInput(input)),
  },
  {
    name: "run_cypress",
    description: "Runs Cypress for selected specs (dry-run by default).",
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
          enum: ["json", "junit", "text"],
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
    handler: async (input) => runCypress(toRunCypressInput(input)),
  },
  {
    name: "read_cypress_report",
    description: "Reads and normalizes Cypress report output.",
    inputSchema: {
      type: "object",
      properties: {
        reportPath: { type: "string" },
        reportFormat: {
          type: "string",
          enum: ["json", "junit", "text"],
        },
        repoRoot: { type: "string" },
      },
      additionalProperties: false,
    },
    handler: async (input) => readCypressReport(toReadCypressReportInput(input)),
  },
  {
    name: "collect_artifacts",
    description: "Collects Cypress artifacts from configured directories.",
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
    description: "Suggests missing mappings and missing Cypress coverage.",
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
          enum: ["json", "junit", "text"],
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
          enum: ["json", "junit", "text"],
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
