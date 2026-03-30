import { DEFAULT_FLOW_SPEC_MAP_PATH, findRepositoryRoot, loadFlowSpecMapConfig } from "../config.js";
import type { SuggestMissingTestsInput, SuggestMissingTestsOutput } from "../types.js";
import { toSortedUnique } from "../utils/fs.js";

export async function suggestMissingTests(
  input: SuggestMissingTestsInput,
): Promise<SuggestMissingTestsOutput> {
  const repoRoot = await findRepositoryRoot(input.repoRoot ?? process.cwd());
  const flowSpecMapPath = input.flowSpecMapPath ?? DEFAULT_FLOW_SPEC_MAP_PATH;
  const { config } = await loadFlowSpecMapConfig(repoRoot, flowSpecMapPath);

  const impactedFlowIds = toSortedUnique(input.impactedFlowIds);
  const unmappedFiles = toSortedUnique(input.unmappedFiles);
  const flowsWithoutSpecs = impactedFlowIds.filter((flowId) => {
    const specs = config.flowToSpecs[flowId] ?? [];
    return specs.length === 0;
  });

  const suggestions: string[] = [];

  for (const flowId of flowsWithoutSpecs) {
    suggestions.push(
      `Flow '${flowId}' has no mapped Playwright specs. Add entries to config/regression/flow-spec-map.json.`,
    );
  }

  for (const filePath of unmappedFiles) {
    suggestions.push(
      `Changed file '${filePath}' is not mapped to a business flow. Add a mapping in config/regression/flow-map.json.`,
    );
  }

  return {
    tool: "suggest_missing_tests",
    flowsWithoutSpecs: toSortedUnique(flowsWithoutSpecs),
    unmappedFiles,
    suggestions,
    warnings: [],
  };
}
