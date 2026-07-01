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
  ScenarioImplementationStatus,
  ValidatePlaywrightSuiteFlowResult,
  ValidatePlaywrightSuiteInput,
  ValidatePlaywrightSuiteOutput,
} from "../types.js";
import { toSortedUnique } from "../utils/fs.js";
import {
  createTestTitlePattern,
  extractFlowCoverage,
  extractTestTitle,
  parseCoverageTitle,
  toScenarioId,
} from "../utils/scaffold.js";

interface CoverageEntry {
  scenarioTitle: string;
  scenarioId: string;
  status: ScenarioImplementationStatus;
}

function extractCoverageEntries(
  specContent: string,
  flowId: string,
  specPath: string,
): { entries: CoverageEntry[]; warnings: string[] } {
  const entries: CoverageEntry[] = [];
  const warnings: string[] = [];
  const testTitlePattern = createTestTitlePattern();
  let match = testTitlePattern.exec(specContent);

  while (match) {
    const title = extractTestTitle(match);
    const parsed = parseCoverageTitle(title);
    if (parsed) {
      const scenarioId = parsed.scenarioId ?? toScenarioId(flowId, parsed.scenarioTitle);
      const status = parsed.status ?? "scaffold";

      if (!parsed.hasScenarioIdMarker) {
        warnings.push(
          `Flow '${flowId}' scenario '${parsed.scenarioTitle}' in '${specPath}' has no scenario-id marker; defaulted to '${scenarioId}'.`,
        );
      }

      if (!parsed.hasStatusMarker) {
        warnings.push(
          `Flow '${flowId}' scenario '${parsed.scenarioTitle}' in '${specPath}' has no status marker; defaulted to 'scaffold'.`,
        );
      }

      entries.push({
        scenarioTitle: parsed.scenarioTitle,
        scenarioId,
        status,
      });
    }
    match = testTitlePattern.exec(specContent);
  }

  return {
    entries,
    warnings,
  };
}

function isConcreteSpecPath(specPath: string): boolean {
  return !specPath.includes("*") && !specPath.includes("?");
}

export async function validatePlaywrightSuite(
  input: ValidatePlaywrightSuiteInput = {},
): Promise<ValidatePlaywrightSuiteOutput> {
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
  const flowResults: ValidatePlaywrightSuiteFlowResult[] = [];

  for (const flowId of targetFlows) {
    const requiredScenarios = coverageByFlow[flowId] ?? [];
    const mappedSpecs = toSortedUnique(flowSpecMapConfig.flowToSpecs[flowId] ?? []);
    const concreteSpecs = mappedSpecs.filter(isConcreteSpecPath);
    const missingSpecFiles: string[] = [];
    const requiredStatusByScenario = new Map<
      string,
      { scenarioId: string; status: ScenarioImplementationStatus }
    >();

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
      const coverage = extractCoverageEntries(content, flowId, specPath);
      warnings.push(...coverage.warnings);

      for (const entry of coverage.entries) {
        if (!requiredScenarios.includes(entry.scenarioTitle)) {
          continue;
        }

        const current = requiredStatusByScenario.get(entry.scenarioTitle);
        if (!current || current.status !== "implemented" || entry.status === "implemented") {
          requiredStatusByScenario.set(entry.scenarioTitle, {
            scenarioId: entry.scenarioId,
            status: entry.status,
          });
        }
      }
    }

    const coveredScenariosSorted = Array.from(requiredStatusByScenario.keys()).sort((a, b) =>
      a.localeCompare(b),
    );
    const missingScenarios = requiredScenarios.filter((scenario) => !requiredStatusByScenario.has(scenario));
    const implementedScenarios = requiredScenarios.filter(
      (scenario) => requiredStatusByScenario.get(scenario)?.status === "implemented",
    );
    const needsWiringScenarios = requiredScenarios.filter(
      (scenario) =>
        requiredStatusByScenario.has(scenario) &&
        requiredStatusByScenario.get(scenario)?.status === "needs-wiring",
    );
    const scaffoldScenarios = requiredScenarios.filter(
      (scenario) =>
        requiredStatusByScenario.has(scenario) &&
        requiredStatusByScenario.get(scenario)?.status !== "implemented" &&
        requiredStatusByScenario.get(scenario)?.status !== "needs-wiring",
    );

    const implementedScenarioIds = implementedScenarios
      .map((scenario) => requiredStatusByScenario.get(scenario)?.scenarioId ?? toScenarioId(flowId, scenario))
      .sort((a, b) => a.localeCompare(b));

    const needsWiringScenarioIds = needsWiringScenarios
      .map((scenario) => requiredStatusByScenario.get(scenario)?.scenarioId ?? toScenarioId(flowId, scenario))
      .sort((a, b) => a.localeCompare(b));

    const scaffoldScenarioIds = scaffoldScenarios
      .map((scenario) => requiredStatusByScenario.get(scenario)?.scenarioId ?? toScenarioId(flowId, scenario))
      .sort((a, b) => a.localeCompare(b));

    flowResults.push({
      flowId,
      requiredScenarios,
      coveredScenarios: coveredScenariosSorted,
      missingScenarios,
      implementedScenarios,
      needsWiringScenarios,
      scaffoldScenarios,
      implementedScenarioIds: toSortedUnique(implementedScenarioIds),
      needsWiringScenarioIds: toSortedUnique(needsWiringScenarioIds),
      scaffoldScenarioIds: toSortedUnique(scaffoldScenarioIds),
      mappedSpecs,
      missingSpecFiles: toSortedUnique(missingSpecFiles),
    });
  }

  const incompleteFlows = flowResults
    .filter(
      (result) =>
        result.missingScenarios.length > 0 ||
        result.missingSpecFiles.length > 0 ||
        result.needsWiringScenarios.length > 0 ||
        result.scaffoldScenarios.length > 0,
    )
    .map((result) => result.flowId)
    .sort((a, b) => a.localeCompare(b));

  const needsWiringFlows = flowResults
    .filter((result) => result.needsWiringScenarios.length > 0)
    .map((result) => result.flowId)
    .sort((a, b) => a.localeCompare(b));

  const scaffoldFlows = flowResults
    .filter((result) => result.scaffoldScenarios.length > 0)
    .map((result) => result.flowId)
    .sort((a, b) => a.localeCompare(b));

  return {
    tool: "validate_playwright_suite",
    policyPath: resolvedPolicyPath,
    flowSpecMapPath: resolvedFlowSpecMapPath,
    targetFlows,
    isComplete: incompleteFlows.length === 0,
    incompleteFlows,
    needsWiringFlows,
    scaffoldFlows,
    flowResults,
    warnings: toSortedUnique(warnings),
  };
}
