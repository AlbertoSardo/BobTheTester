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
import type {
  GeneratePlaywrightSuiteInput,
  GeneratePlaywrightSuiteOutput,
  JsonValue,
  ScenarioImplementationStatus,
} from "../types.js";
import { toSortedUnique } from "../utils/fs.js";
import {
  buildCoverageTitle,
  parseCoverageTitle,
  toScenarioId,
} from "../utils/scaffold.js";

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function toRelative(repoRoot: string, absolutePath: string): string {
  return normalizePath(path.relative(repoRoot, absolutePath));
}

function escapeDoubleQuotedString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeForQuote(value: string, quote: '"' | "'" | "`"): string {
  if (quote === '"') {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  if (quote === "'") {
    return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  return value.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
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

interface ExistingCoverageEntry {
  scenarioId: string;
  status: ScenarioImplementationStatus;
}

function extractExistingCoverageEntries(
  specContent: string,
  flowId: string,
): Record<string, ExistingCoverageEntry> {
  const entries: Record<string, ExistingCoverageEntry> = {};
  const testTitlePattern =
    /\b(?:test|it)\s*\(\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`)\s*,/g;
  let match = testTitlePattern.exec(specContent);

  while (match) {
    const title = match[1] ?? match[2] ?? match[3] ?? "";
    const parsed = parseCoverageTitle(title);

    if (!parsed) {
      match = testTitlePattern.exec(specContent);
      continue;
    }

    const status = parsed.status ?? "scaffold";
    const scenarioId = parsed.scenarioId ?? toScenarioId(flowId, parsed.scenarioTitle);
    const current = entries[parsed.scenarioTitle];

    if (!current || current.status !== "implemented" || status === "implemented") {
      entries[parsed.scenarioTitle] = {
        scenarioId,
        status,
      };
    }

    match = testTitlePattern.exec(specContent);
  }

  return entries;
}

function normalizeCoverageTitles(
  specContent: string,
  flowId: string,
  requiredScenarios: Set<string>,
  existingEntries: Record<string, ExistingCoverageEntry>,
): { content: string; updated: boolean } {
  let updated = false;

  const testCallPattern =
    /\b((?:test|it)\s*\(\s*)(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`)(\s*,)/g;

  const content = specContent.replace(
    testCallPattern,
    (match, prefix: string, doubleQuoted: string, singleQuoted: string, templateQuoted: string, suffix: string) => {
      const originalTitle = doubleQuoted ?? singleQuoted ?? templateQuoted ?? "";
      const quote: '"' | "'" | "`" =
        typeof doubleQuoted === "string"
          ? '"'
          : typeof singleQuoted === "string"
            ? "'"
            : "`";

      const parsed = parseCoverageTitle(originalTitle);
      if (!parsed || !requiredScenarios.has(parsed.scenarioTitle)) {
        return match;
      }

      const existingEntry = existingEntries[parsed.scenarioTitle];
      const normalizedScenarioId =
        existingEntry?.scenarioId ?? parsed.scenarioId ?? toScenarioId(flowId, parsed.scenarioTitle);
      const normalizedStatus = existingEntry?.status ?? parsed.status ?? "scaffold";
      const normalizedTitle = buildCoverageTitle(
        parsed.scenarioTitle,
        normalizedScenarioId,
        normalizedStatus,
      );

      if (normalizedTitle === originalTitle) {
        return match;
      }

      updated = true;
      return `${prefix}${quote}${escapeForQuote(normalizedTitle, quote)}${quote}${suffix}`;
    },
  );

  return { content, updated };
}

function createCoverageTestBlock(
  flowId: string,
  scenario: string,
  scenarioId: string,
  status: ScenarioImplementationStatus,
): string {
  const escapedFlowId = escapeDoubleQuotedString(flowId);
  const escapedScenarioId = escapeDoubleQuotedString(scenarioId);
  const title = escapeDoubleQuotedString(buildCoverageTitle(scenario, scenarioId, status));

  return [
    `  test("${title}", async () => {`,
    "    const scenarioMeta = {",
    `      flowId: "${escapedFlowId}",`,
    `      scenarioId: "${escapedScenarioId}",`,
    `      implementationStatus: "${status}" as const,`,
    "    };",
    "",
    `    expect(scenarioMeta.flowId).toBe("${escapedFlowId}");`,
    `    expect(scenarioMeta.implementationStatus).toBe("${status}");`,
    "  });",
  ].join("\n");
}

function appendCoverageTests(specContent: string, missingScenarios: string[], flowId: string): string {
  const blocks = missingScenarios.map((scenario) =>
    createCoverageTestBlock(flowId, scenario, toScenarioId(flowId, scenario), "scaffold"),
  );
  const trimmed = specContent.trimEnd();
  const closingIndex = trimmed.lastIndexOf("\n});");

  if (closingIndex < 0) {
    return `${trimmed}\n\n${blocks.join("\n\n")}\n`;
  }

  const beforeClosing = trimmed.slice(0, closingIndex);
  const closingPart = trimmed.slice(closingIndex + 1);
  return `${beforeClosing}\n\n${blocks.join("\n\n")}\n${closingPart}\n`;
}

function createPlaceholderTestBlock(flowId: string): string {
  const escapedFlowId = escapeDoubleQuotedString(flowId);
  const anchor = escapeDoubleQuotedString(flowId.split("-")[0] || flowId);

  return [
    `  test("loads deterministic ${escapedFlowId} scaffold placeholder", async () => {`,
    '    if (process.env.FORCE_FAIL === "1") {',
    '      throw new Error("Forced failure for artifact validation");',
    "    }",
    "",
    `    expect("${escapedFlowId}").toContain("${anchor}");`,
    "  });",
  ].join("\n");
}

function createNewSpecContent(flowId: string, scenarios: string[]): string {
  const tests = scenarios.map((scenario) =>
    createCoverageTestBlock(flowId, scenario, toScenarioId(flowId, scenario), "scaffold"),
  );

  return [
    'import { expect, test } from "@playwright/test";',
    "",
    `test.describe("${escapeDoubleQuotedString(flowId)} flow", () => {`,
    createPlaceholderTestBlock(flowId),
    "",
    tests.join("\n\n"),
    "});",
    "",
  ].join("\n");
}

function sortFlowSpecMap(flowToSpecs: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(flowToSpecs)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([flowId, specPaths]) => [flowId, toSortedUnique(specPaths)]),
  );
}

function defaultSpecPath(flowId: string): string {
  return `playwright/e2e/flows/${flowId}.spec.ts`;
}

function pickConcreteSpecPath(specPaths: string[]): string | undefined {
  return specPaths.find((specPath) => !specPath.includes("*") && !specPath.includes("?"));
}

export async function generatePlaywrightSuite(
  input: GeneratePlaywrightSuiteInput = {},
): Promise<GeneratePlaywrightSuiteOutput> {
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

    generatedTestsByFlow[flowId] = scenarios.map((scenario) =>
      buildCoverageTitle(scenario, toScenarioId(flowId, scenario), "scaffold"),
    );

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
    const existingCoverageEntries = extractExistingCoverageEntries(existingSpecContent, flowId);
    const requiredScenarioSet = new Set(scenarios);

    const normalized = normalizeCoverageTitles(
      existingSpecContent,
      flowId,
      requiredScenarioSet,
      existingCoverageEntries,
    );

    const coverageEntriesAfterNormalization = extractExistingCoverageEntries(normalized.content, flowId);
    const missingScenarios = scenarios.filter(
      (scenario) =>
        !Object.prototype.hasOwnProperty.call(coverageEntriesAfterNormalization, scenario),
    );

    if (missingScenarios.length === 0 && !normalized.updated) {
      unchangedSpecFiles.push(relativeSpecPath);
      continue;
    }

    const updatedSpecContent = appendCoverageTests(normalized.content, missingScenarios, flowId);
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
    tool: "generate_playwright_suite",
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
