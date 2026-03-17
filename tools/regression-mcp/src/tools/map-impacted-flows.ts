import path from "node:path";

import {
  DEFAULT_FLOW_MAP_PATH,
  findRepositoryRoot,
  loadFlowMapConfig,
  resolveFromRepoRoot,
} from "../config.js";
import type { MapImpactedFlowsInput, MapImpactedFlowsOutput } from "../types.js";
import { toSortedUnique } from "../utils/fs.js";
import { matchesPattern, normalizeForMatch } from "../utils/pattern.js";

function toRepoRelativePath(repoRoot: string, filePath: string): string {
  const normalizedFile = path.normalize(filePath);
  if (!path.isAbsolute(normalizedFile)) {
    return normalizeForMatch(normalizedFile);
  }

  const relative = path.relative(repoRoot, normalizedFile);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return normalizeForMatch(normalizedFile);
  }

  return normalizeForMatch(relative);
}

export async function mapImpactedFlows(
  input: MapImpactedFlowsInput,
): Promise<MapImpactedFlowsOutput> {
  const repoRoot = await findRepositoryRoot(input.repoRoot ?? process.cwd());
  const flowMapPath = input.flowMapPath ?? DEFAULT_FLOW_MAP_PATH;
  const { config } = await loadFlowMapConfig(repoRoot, flowMapPath);
  const warnings: string[] = [];

  const changedFiles = toSortedUnique(input.changedFiles.map((filePath) => toRepoRelativePath(repoRoot, filePath)));
  const impactedFlows = new Set<string>();
  const fileToFlows: Record<string, string[]> = {};
  const unmappedFiles: string[] = [];

  for (const file of changedFiles) {
    const matchedFlowIds = config.mappings
      .filter((mapping) => mapping.filePatterns.some((pattern) => matchesPattern(file, pattern)))
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
