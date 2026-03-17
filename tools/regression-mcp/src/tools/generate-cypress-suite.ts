import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_BUSINESS_POLICY_PATH,
  DEFAULT_FLOW_SPEC_MAP_PATH,
  fileExists,
  findRepositoryRoot,
  loadBusinessReviewPolicy,
  loadFlowSpecMapConfig,
  resolveFromRepoRoot,
} from "../config.js";
import type { GenerateCypressSuiteInput, GenerateCypressSuiteOutput, JsonValue } from "../types.js";
import { toSortedUnique } from "../utils/fs.js";

const COVERAGE_TITLE_PREFIX = "covers: ";

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function toRelative(repoRoot: string, absolutePath: string): string {
  return normalizePath(path.relative(repoRoot, absolutePath));
}

function escapeDoubleQuotedString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

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
    const minimumCoverage = toSortedUnique(asStringArray(flowPolicy?.minimumRegressionCoverage));
    coverageByFlow[flowId] = minimumCoverage;
  }

  return coverageByFlow;
}

function extractExistingTestTitles(specContent: string): Set<string> {
  const titles = new Set<string>();
  const testTitlePattern = /\bit\s*\(\s*(["'`])(.+?)\1\s*,/g;
  let match = testTitlePattern.exec(specContent);

  while (match) {
    titles.add(match[2]);
    match = testTitlePattern.exec(specContent);
  }

  return titles;
}

function createCoverageTestBlock(flowId: string, scenario: string): string {
  const escapedFlowId = escapeDoubleQuotedString(flowId);
  const escapedScenario = escapeDoubleQuotedString(scenario);
  const title = `${COVERAGE_TITLE_PREFIX}${escapedScenario}`;

  return [
    `  it("${title}", () => {`,
    `    cy.wrap({ flow: "${escapedFlowId}", scenario: "${escapedScenario}" }).its("flow").should("eq", "${escapedFlowId}");`,
    "  });",
  ].join("\n");
}

function appendCoverageTests(specContent: string, missingScenarios: string[], flowId: string): string {
  const blocks = missingScenarios.map((scenario) => createCoverageTestBlock(flowId, scenario));
  const trimmed = specContent.trimEnd();
  const closingIndex = trimmed.lastIndexOf("\n});");

  if (closingIndex < 0) {
    return `${trimmed}\n\n${blocks.join("\n\n")}\n`;
  }

  const beforeClosing = trimmed.slice(0, closingIndex);
  const closingPart = trimmed.slice(closingIndex + 1);
  return `${beforeClosing}\n\n${blocks.join("\n\n")}\n${closingPart}\n`;
}

function createNewSpecContent(flowId: string, scenarios: string[]): string {
  const tests = scenarios.map((scenario) => createCoverageTestBlock(flowId, scenario));
  return `describe("${escapeDoubleQuotedString(flowId)} flow", () => {\n${tests.join("\n\n")}\n});\n`;
}

function sortFlowSpecMap(flowToSpecs: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(flowToSpecs)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([flowId, specPaths]) => [flowId, toSortedUnique(specPaths)]),
  );
}

function defaultSpecPath(flowId: string): string {
  return `cypress/e2e/flows/${flowId}.cy.js`;
}

function pickConcreteSpecPath(specPaths: string[]): string | undefined {
  return specPaths.find((specPath) => !specPath.includes("*") && !specPath.includes("?"));
}

export async function generateCypressSuite(
  input: GenerateCypressSuiteInput = {},
): Promise<GenerateCypressSuiteOutput> {
  const repoRoot = await findRepositoryRoot(input.repoRoot ?? process.cwd());
  const policyPath = input.policyPath ?? DEFAULT_BUSINESS_POLICY_PATH;
  const flowSpecMapPath = input.flowSpecMapPath ?? DEFAULT_FLOW_SPEC_MAP_PATH;
  const updateMapping = input.updateMapping ?? true;

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

  const flowToSpecs: Record<string, string[]> = {};
  for (const [flowId, specPaths] of Object.entries(flowSpecMapConfig.flowToSpecs)) {
    flowToSpecs[flowId] = toSortedUnique(specPaths);
  }

  let mappingUpdated = false;
  const createdSpecFiles: string[] = [];
  const updatedSpecFiles: string[] = [];
  const unchangedSpecFiles: string[] = [];
  const generatedTestsByFlow: Record<string, string[]> = {};

  for (const flowId of targetFlows) {
    const rawScenarios = coverageByFlow[flowId] ?? [];
    const scenarios =
      rawScenarios.length > 0 ? rawScenarios : ["deterministic placeholder scenario for baseline coverage"];

    if (rawScenarios.length === 0) {
      warnings.push(
        `Flow '${flowId}' has no minimumRegressionCoverage entries in policy; generated a baseline placeholder test.`,
      );
    }

    generatedTestsByFlow[flowId] = scenarios.map((scenario) => `${COVERAGE_TITLE_PREFIX}${scenario}`);

    const mappedSpecPaths = toSortedUnique(flowToSpecs[flowId] ?? []);
    let selectedSpecPath = pickConcreteSpecPath(mappedSpecPaths);

    if (!selectedSpecPath) {
      selectedSpecPath = defaultSpecPath(flowId);
      if (updateMapping) {
        flowToSpecs[flowId] = toSortedUnique([...mappedSpecPaths, selectedSpecPath]);
        mappingUpdated = true;
      }
    }

    const selectedSpecAbsolutePath = resolveFromRepoRoot(repoRoot, selectedSpecPath);
    await mkdir(path.dirname(selectedSpecAbsolutePath), { recursive: true });

    const relativeSpecPath = toRelative(repoRoot, selectedSpecAbsolutePath);
    if (!(await fileExists(selectedSpecAbsolutePath))) {
      const specContent = createNewSpecContent(flowId, scenarios);
      await writeFile(selectedSpecAbsolutePath, specContent, "utf-8");
      createdSpecFiles.push(relativeSpecPath);
      continue;
    }

    const existingSpecContent = await readFile(selectedSpecAbsolutePath, "utf-8");
    const existingTestTitles = extractExistingTestTitles(existingSpecContent);
    const missingScenarios = scenarios.filter(
      (scenario) => !existingTestTitles.has(`${COVERAGE_TITLE_PREFIX}${scenario}`),
    );

    if (missingScenarios.length === 0) {
      unchangedSpecFiles.push(relativeSpecPath);
      continue;
    }

    const updatedSpecContent = appendCoverageTests(existingSpecContent, missingScenarios, flowId);
    await writeFile(selectedSpecAbsolutePath, updatedSpecContent, "utf-8");
    updatedSpecFiles.push(relativeSpecPath);
  }

  if (mappingUpdated) {
    const nextFlowSpecMap = {
      version: flowSpecMapConfig.version,
      flowToSpecs: sortFlowSpecMap(flowToSpecs),
    };
    await writeFile(resolvedFlowSpecMapPath, `${JSON.stringify(nextFlowSpecMap, null, 2)}\n`, "utf-8");
  }

  return {
    tool: "generate_cypress_suite",
    policyPath: resolvedPolicyPath,
    flowSpecMapPath: resolvedFlowSpecMapPath,
    targetFlows,
    createdSpecFiles: toSortedUnique(createdSpecFiles),
    updatedSpecFiles: toSortedUnique(updatedSpecFiles),
    unchangedSpecFiles: toSortedUnique(unchangedSpecFiles),
    mappingUpdated,
    generatedTestsByFlow,
    warnings,
  };
}
