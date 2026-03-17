import { access, readFile } from "node:fs/promises";
import path from "node:path";

import type { FlowMapConfig, FlowSpecMapConfig, JsonValue, ToolingConfig } from "./types.js";

export const DEFAULT_FLOW_MAP_PATH = "config/regression/flow-map.json";
export const DEFAULT_FLOW_SPEC_MAP_PATH = "config/regression/flow-spec-map.json";
export const DEFAULT_TOOLING_CONFIG_PATH = "config/regression/tooling.json";
export const DEFAULT_BUSINESS_POLICY_PATH = "config/regression/business-review-policy.json";

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function findRepositoryRoot(startDir = process.cwd()): Promise<string> {
  let current = path.resolve(startDir);

  while (true) {
    const markerPath = path.join(current, "AGENTS.md");
    if (await fileExists(markerPath)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(startDir);
    }

    current = parent;
  }
}

export function resolveFromRepoRoot(repoRoot: string, filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  return path.join(repoRoot, filePath);
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

export async function loadFlowMapConfig(
  repoRoot: string,
  flowMapPath = DEFAULT_FLOW_MAP_PATH,
): Promise<{ path: string; config: FlowMapConfig }> {
  const resolvedPath = resolveFromRepoRoot(repoRoot, flowMapPath);
  const config = await readJsonFile<FlowMapConfig>(resolvedPath);
  return { path: resolvedPath, config };
}

export async function loadFlowSpecMapConfig(
  repoRoot: string,
  flowSpecMapPath = DEFAULT_FLOW_SPEC_MAP_PATH,
): Promise<{ path: string; config: FlowSpecMapConfig }> {
  const resolvedPath = resolveFromRepoRoot(repoRoot, flowSpecMapPath);
  const config = await readJsonFile<FlowSpecMapConfig>(resolvedPath);
  return { path: resolvedPath, config };
}

export async function loadToolingConfig(
  repoRoot: string,
  toolingConfigPath = DEFAULT_TOOLING_CONFIG_PATH,
): Promise<{ path: string; config: ToolingConfig }> {
  const resolvedPath = resolveFromRepoRoot(repoRoot, toolingConfigPath);
  const config = await readJsonFile<ToolingConfig>(resolvedPath);
  return { path: resolvedPath, config };
}

export async function loadBusinessReviewPolicy(
  repoRoot: string,
  businessPolicyPath = DEFAULT_BUSINESS_POLICY_PATH,
): Promise<{ path: string; policy: { [key: string]: JsonValue } }> {
  const resolvedPath = resolveFromRepoRoot(repoRoot, businessPolicyPath);
  const policy = await readJsonFile<{ [key: string]: JsonValue }>(resolvedPath);
  return { path: resolvedPath, policy };
}
