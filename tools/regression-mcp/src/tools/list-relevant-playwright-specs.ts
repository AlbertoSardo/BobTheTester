import {
  DEFAULT_FLOW_SPEC_MAP_PATH,
  fileExists,
  findRepositoryRoot,
  loadFlowSpecMapConfig,
  resolveFromRepoRoot,
} from "../config.js";
import type {
  ListRelevantPlaywrightSpecsInput,
  ListRelevantPlaywrightSpecsOutput,
} from "../types.js";
import { toSortedUnique } from "../utils/fs.js";

export async function listRelevantPlaywrightSpecs(
  input: ListRelevantPlaywrightSpecsInput,
): Promise<ListRelevantPlaywrightSpecsOutput> {
  const repoRoot = await findRepositoryRoot(input.repoRoot ?? process.cwd());
  const flowSpecMapPath = input.flowSpecMapPath ?? DEFAULT_FLOW_SPEC_MAP_PATH;
  const { config } = await loadFlowSpecMapConfig(repoRoot, flowSpecMapPath);
  const warnings: string[] = [];

  const impactedFlowIds = toSortedUnique(input.impactedFlowIds);
  const resolvedSpecs: string[] = [];
  const flowToSpecs: Record<string, string[]> = {};
  const flowsWithoutSpecs: string[] = [];

  for (const flowId of impactedFlowIds) {
    const mappedSpecs = toSortedUnique(config.flowToSpecs[flowId] ?? []);
    const existingSpecs: string[] = [];

    for (const specPath of mappedSpecs) {
      const isGlobPattern = specPath.includes("*") || specPath.includes("?");
      if (isGlobPattern) {
        existingSpecs.push(specPath);
        continue;
      }

      const specAbsolutePath = resolveFromRepoRoot(repoRoot, specPath);
      if (await fileExists(specAbsolutePath)) {
        existingSpecs.push(specPath);
        continue;
      }

      warnings.push(`Mapped Playwright spec is missing on disk: ${specPath}`);
    }

    flowToSpecs[flowId] = existingSpecs;

    if (existingSpecs.length === 0) {
      flowsWithoutSpecs.push(flowId);
      continue;
    }

    resolvedSpecs.push(...existingSpecs);
  }

  return {
    tool: "list_relevant_playwright_specs",
    flowSpecMapPath: resolveFromRepoRoot(repoRoot, flowSpecMapPath),
    resolvedSpecs: toSortedUnique(resolvedSpecs),
    flowToSpecs,
    flowsWithoutSpecs,
    warnings,
  };
}
