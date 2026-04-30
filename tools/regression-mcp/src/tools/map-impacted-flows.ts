import {
  DEFAULT_FLOW_MAP_PATH,
  findRepositoryRoot,
  loadFlowMapConfig,
  resolveFromRepoRoot,
} from "../config.js";
import type { MapImpactedFlowsInput, MapImpactedFlowsOutput } from "../types.js";
import { toRepoRelativePath, toSortedUnique } from "../utils/fs.js";
import { matchesPattern } from "../utils/pattern.js";

export async function mapImpactedFlows(input: MapImpactedFlowsInput): Promise<MapImpactedFlowsOutput> {
  const repoRoot = await findRepositoryRoot(input.repoRoot ?? process.cwd());
  const flowMapPath = input.flowMapPath ?? DEFAULT_FLOW_MAP_PATH;
  const { config } = await loadFlowMapConfig(repoRoot, flowMapPath);
  const warnings: string[] = [];

  const changedFiles = toSortedUnique(
    input.changedFiles.map((filePath) => toRepoRelativePath(repoRoot, filePath)),
  );
  const impactedFlows = new Set<string>();
  const fileToFlows: Record<string, string[]> = {};
  const unmappedFiles: string[] = [];

  for (const file of changedFiles) {
    const matchedFlowIds = (config.mappings ?? [])
      .filter((mapping) => Array.isArray(mapping.filePatterns) && mapping.filePatterns.some((pattern) => matchesPattern(file, pattern)))
      .map((mapping) => mapping.flowId);

    const uniqueFlowIds = toSortedUnique(matchedFlowIds);
    fileToFlows[file] = uniqueFlowIds;

    if (uniqueFlowIds.length === 0) {
      unmappedFiles.push(file);
      continue;
    }

    for (const flowId of uniqueFlowIds) {
      impactedFlows.add(flowId);
    }
  }

  return {
    tool: "map_impacted_flows",
    flowMapPath: resolveFromRepoRoot(repoRoot, flowMapPath),
    impactedFlowIds: Array.from(impactedFlows).sort((a, b) => a.localeCompare(b)),
    fileToFlows,
    unmappedFiles: toSortedUnique(unmappedFiles),
    warnings,
  };
}
