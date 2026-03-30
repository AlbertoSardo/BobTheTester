import { DEFAULT_BUSINESS_POLICY_PATH, findRepositoryRoot, loadBusinessReviewPolicy } from "../config.js";
import type { JsonValue, ReadBusinessReviewPolicyInput, ReadBusinessReviewPolicyOutput } from "../types.js";

function readPolicyVersion(policy: { [key: string]: JsonValue }): number | null {
  const value = policy.version;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readFlowIds(policy: { [key: string]: JsonValue }): string[] {
  const flowsValue = policy.flows;
  if (!flowsValue || typeof flowsValue !== "object" || Array.isArray(flowsValue)) {
    return [];
  }

  return Object.keys(flowsValue).sort((a, b) => a.localeCompare(b));
}

export async function readBusinessReviewPolicy(
  input: ReadBusinessReviewPolicyInput = {},
): Promise<ReadBusinessReviewPolicyOutput> {
  const repoRoot = await findRepositoryRoot(input.repoRoot ?? process.cwd());
  const policyPath = input.policyPath ?? DEFAULT_BUSINESS_POLICY_PATH;
  const { path, policy } = await loadBusinessReviewPolicy(repoRoot, policyPath);

  return {
    tool: "read_business_review_policy",
    policyPath: path,
    policyVersion: readPolicyVersion(policy),
    flowIds: readFlowIds(policy),
    policy,
    warnings: [],
  };
}
