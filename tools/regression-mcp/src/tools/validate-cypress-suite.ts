import { readFile } from "node:fs/promises";

import {
  DEFAULT_BUSINESS_POLICY_PATH,
  DEFAULT_FLOW_SPEC_MAP_PATH,
  fileExists,
  findRepositoryRoot,
  loadBusinessReviewPolicy,
  loadFlowSpecMapConfig,
  resolveFromRepoRoot,
} from "../config.js";
import type {
  JsonValue,
  ValidateCypressSuiteFlowResult,
  ValidateCypressSuiteInput,
  ValidateCypressSuiteOutput,
} from "../types.js";
import { toSortedUnique } from "../utils/fs.js";

const COVERAGE_TITLE_PREFIX = "covers: ";

function asObjectRecord(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, JsonValue>;
}

function asStringArray(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function extractFlowCoverage(policy: Record<string, JsonValue>): Record<string, string[]> {
  const flowsRecord = asObjectRecord(policy.flows);
  if (!flowsRecord) {
    return {};
  }

  const coverageByFlow: Record<string, string[]> = {};

  for (const [flowId, flowPolicyValue] of Object.entries(flowsRecord)) {
    const flowPolicy = asObjectRecord(flowPolicyValue);
    coverageByFlow[flowId] = toSortedUnique(asStringArray(flowPolicy?.minimumRegressionCoverage));
  }

  return coverageByFlow;
}

function extractCoverageTitles(specContent: string): string[] {
  const coverageTitles: string[] = [];
  const testTitlePattern = /\bit\s*\(\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`)\s*,/g;
  let match = testTitlePattern.exec(specContent);

  while (match) {
    const title = match[1] ?? match[2] ?? match[3] ?? "";
    if (title.startsWith(COVERAGE_TITLE_PREFIX)) {
      coverageTitles.push(title.slice(COVERAGE_TITLE_PREFIX.length));
    }
    match = testTitlePattern.exec(specContent);
  }

  return toSortedUnique(coverageTitles);
}

function isConcreteSpecPath(specPath: string): boolean {
  return !specPath.includes("*") && !specPath.includes("?");
}

export async function validateCypressSuite(
  input: ValidateCypressSuiteInput = {},
): Promise<ValidateCypressSuiteOutput> {
  const repoRoot = await findRepositoryRoot(input.repoRoot ?? process.cwd());
  const policyPath = input.policyPath ?? DEFAULT_BUSINESS_POLICY_PATH;
  const flowSpecMapPath = input.flowSpecMapPath ?? DEFAULT_FLOW_SPEC_MAP_PATH;

  const { path: resolvedPolicyPath, policy } = await loadBusinessReviewPolicy(repoRoot, policyPath);
  const { path: resolvedFlowSpecMapPath, config: flowSpecMapConfig } = await loadFlowSpecMapConfig(
    repoRoot,
    flowSpecMapPath,
  );

  const warnings: string[] = [];
  const coverageByFlow = extractFlowCoverage(policy);
  const knownFlows = Object.keys(coverageByFlow).sort((a, b) => a.localeCompare(b));
  const requestedFlows = toSortedUnique(input.flows ?? knownFlows);

  const unknownRequestedFlows = requestedFlows.filter((flowId) => !knownFlows.includes(flowId));
  if (unknownRequestedFlows.length > 0) {
    warnings.push(
      `Requested flows are not defined in policy and were ignored: ${unknownRequestedFlows.join(", ")}`,
    );
  }

  const targetFlows = requestedFlows.filter((flowId) => knownFlows.includes(flowId));
  const flowResults: ValidateCypressSuiteFlowResult[] = [];

  for (const flowId of targetFlows) {
    const requiredScenarios = coverageByFlow[flowId] ?? [];
    const mappedSpecs = toSortedUnique(flowSpecMapConfig.flowToSpecs[flowId] ?? []);
    const concreteSpecs = mappedSpecs.filter(isConcreteSpecPath);
    const missingSpecFiles: string[] = [];
    const coveredScenarios = new Set<string>();

    if (mappedSpecs.length === 0) {
      warnings.push(`Flow '${flowId}' has no mapped specs in flow-spec-map.`);
    }

    if (mappedSpecs.length > concreteSpecs.length) {
      warnings.push(
        `Flow '${flowId}' includes wildcard spec mappings; validation only checks concrete paths.`,
      );
    }

    for (const specPath of concreteSpecs) {
      const absolutePath = resolveFromRepoRoot(repoRoot, specPath);
      if (!(await fileExists(absolutePath))) {
        missingSpecFiles.push(specPath);
        continue;
      }

      const content = await readFile(absolutePath, "utf-8");
      const scenarioTitles = extractCoverageTitles(content);
      for (const scenario of scenarioTitles) {
        coveredScenarios.add(scenario);
      }
    }

    const coveredScenariosSorted = Array.from(coveredScenarios).sort((a, b) => a.localeCompare(b));
    const missingScenarios = requiredScenarios.filter((scenario) => !coveredScenarios.has(scenario));

    flowResults.push({
      flowId,
      requiredScenarios,
      coveredScenarios: coveredScenariosSorted,
      missingScenarios,
      mappedSpecs,
      missingSpecFiles: toSortedUnique(missingSpecFiles),
    });
  }

  const incompleteFlows = flowResults
    .filter((result) => result.missingScenarios.length > 0 || result.missingSpecFiles.length > 0)
    .map((result) => result.flowId)
    .sort((a, b) => a.localeCompare(b));

  return {
    tool: "validate_cypress_suite",
    policyPath: resolvedPolicyPath,
    flowSpecMapPath: resolvedFlowSpecMapPath,
    targetFlows,
    isComplete: incompleteFlows.length === 0,
    incompleteFlows,
    flowResults,
    warnings,
  };
}
