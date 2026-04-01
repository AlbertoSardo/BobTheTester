import { access, readFile } from "node:fs/promises";
import path from "node:path";

import type { FlowMapConfig, FlowSpecMapConfig, JsonValue, ToolingConfig } from "./types.js";

export const DEFAULT_FLOW_MAP_PATH = "config/regression/flow-map.json";
export const DEFAULT_FLOW_SPEC_MAP_PATH = "config/regression/flow-spec-map.json";
export const DEFAULT_TOOLING_CONFIG_PATH = "config/regression/tooling.json";
export const DEFAULT_BUSINESS_POLICY_PATH = "config/regression/business-review-policy.json";
export const DEFAULT_CODE_REVIEW_POLICY_PATH = "config/regression/code-review-policy.json";

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
    // Use .git directory as the standard repository root marker
    const gitDir = path.join(current, ".git");
    if (await fileExists(gitDir)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(
        `No git repository found starting from '${startDir}'. ` +
          "Ensure you are running inside a git repository or pass an explicit repoRoot.",
      );
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Failed to parse JSON file '${filePath}': ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `Expected JSON object in '${filePath}', got ${Array.isArray(parsed) ? "array" : typeof parsed}`,
    );
  }
  return parsed as T;
}

export async function loadFlowMapConfig(
  repoRoot: string,
  flowMapPath = DEFAULT_FLOW_MAP_PATH,
): Promise<{ path: string; config: FlowMapConfig }> {
  const resolvedPath = resolveFromRepoRoot(repoRoot, flowMapPath);
  try {
    const config = await readJsonFile<FlowMapConfig>(resolvedPath);
    return { path: resolvedPath, config };
  } catch (error) {
    throw new Error(
      `Failed to load flow-map config from '${resolvedPath}': ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

export async function loadFlowSpecMapConfig(
  repoRoot: string,
  flowSpecMapPath = DEFAULT_FLOW_SPEC_MAP_PATH,
): Promise<{ path: string; config: FlowSpecMapConfig }> {
  const resolvedPath = resolveFromRepoRoot(repoRoot, flowSpecMapPath);
  try {
    const config = await readJsonFile<FlowSpecMapConfig>(resolvedPath);
    return { path: resolvedPath, config };
  } catch (error) {
    throw new Error(
      `Failed to load flow-spec-map config from '${resolvedPath}': ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

export async function loadToolingConfig(
  repoRoot: string,
  toolingConfigPath = DEFAULT_TOOLING_CONFIG_PATH,
): Promise<{ path: string; config: ToolingConfig }> {
  const resolvedPath = resolveFromRepoRoot(repoRoot, toolingConfigPath);
  try {
    const config = await readJsonFile<ToolingConfig>(resolvedPath);
    return { path: resolvedPath, config };
  } catch (error) {
    throw new Error(
      `Failed to load tooling config from '${resolvedPath}': ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

export async function loadBusinessReviewPolicy(
  repoRoot: string,
  businessPolicyPath = DEFAULT_BUSINESS_POLICY_PATH,
): Promise<{ path: string; policy: { [key: string]: JsonValue } }> {
  const resolvedPath = resolveFromRepoRoot(repoRoot, businessPolicyPath);
  try {
    const policy = await readJsonFile<{ [key: string]: JsonValue }>(resolvedPath);
    return { path: resolvedPath, policy };
  } catch (error) {
    throw new Error(
      `Failed to load business review policy from '${resolvedPath}': ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

export async function loadCodeReviewPolicy(
  repoRoot: string,
  codeReviewPolicyPath = DEFAULT_CODE_REVIEW_POLICY_PATH,
): Promise<{ path: string; policy: { [key: string]: JsonValue } }> {
  const resolvedPath = resolveFromRepoRoot(repoRoot, codeReviewPolicyPath);
  try {
    const policy = await readJsonFile<{ [key: string]: JsonValue }>(resolvedPath);
    return { path: resolvedPath, policy };
  } catch (error) {
    throw new Error(
      `Failed to load code review policy from '${resolvedPath}': ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}
