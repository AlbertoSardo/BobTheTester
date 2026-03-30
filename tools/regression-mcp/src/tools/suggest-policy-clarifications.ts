import {
  DEFAULT_BUSINESS_POLICY_PATH,
  DEFAULT_FLOW_MAP_PATH,
  DEFAULT_FLOW_SPEC_MAP_PATH,
  findRepositoryRoot,
  loadBusinessReviewPolicy,
  loadFlowMapConfig,
  loadFlowSpecMapConfig,
} from "../config.js";
import type {
  ClarificationPriority,
  ClarificationQuestion,
  JsonValue,
  SuggestPolicyClarificationsInput,
  SuggestPolicyClarificationsOutput,
} from "../types.js";
import { toSortedUnique } from "../utils/fs.js";
import { asObjectRecord, asStringArrayStrict } from "../utils/helpers.js";

function asNonEmptyString(value: JsonValue | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isPlaceholderLike(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return true;
  }

  if (normalized.startsWith("<") && normalized.endsWith(">")) {
    return true;
  }

  return (
    normalized.includes("to confirm") ||
    normalized.includes("tbd") ||
    normalized.includes("todo") ||
    normalized.includes("placeholder") ||
    normalized.includes("set-") ||
    normalized.includes("change-me") ||
    normalized.includes("replace-me")
  );
}

function isUnclearString(value: string | undefined): boolean {
  if (!value) {
    return true;
  }

  return isPlaceholderLike(value);
}

function isLikelyHttpUrl(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function containsPlaceholder(values: string[]): boolean {
  return values.some((value) => isPlaceholderLike(value));
}

function addQuestion(
  questions: ClarificationQuestion[],
  id: string,
  priority: ClarificationPriority,
  blocking: boolean,
  question: string,
  rationale: string,
  flowId?: string,
): void {
  if (questions.some((entry) => entry.id === id)) {
    return;
  }

  questions.push({
    id,
    flowId,
    priority,
    blocking,
    question,
    rationale,
  });
}

function sortQuestions(questions: ClarificationQuestion[]): ClarificationQuestion[] {
  const priorityOrder: Record<ClarificationPriority, number> = {
    high: 3,
    medium: 2,
    low: 1,
  };

  return [...questions].sort((a, b) => {
    const byPriority = priorityOrder[b.priority] - priorityOrder[a.priority];
    if (byPriority !== 0) {
      return byPriority;
    }

    return a.id.localeCompare(b.id);
  });
}

export async function suggestPolicyClarifications(
  input: SuggestPolicyClarificationsInput = {},
): Promise<SuggestPolicyClarificationsOutput> {
  const repoRoot = await findRepositoryRoot(input.repoRoot ?? process.cwd());
  const policyPath = input.policyPath ?? DEFAULT_BUSINESS_POLICY_PATH;
  const flowMapPath = input.flowMapPath ?? DEFAULT_FLOW_MAP_PATH;
  const flowSpecMapPath = input.flowSpecMapPath ?? DEFAULT_FLOW_SPEC_MAP_PATH;

  const { path: resolvedPolicyPath, policy } = await loadBusinessReviewPolicy(repoRoot, policyPath);
  const { path: resolvedFlowMapPath, config: flowMapConfig } = await loadFlowMapConfig(repoRoot, flowMapPath);
  const { path: resolvedFlowSpecMapPath, config: flowSpecMapConfig } = await loadFlowSpecMapConfig(
    repoRoot,
    flowSpecMapPath,
  );

  const warnings: string[] = [];
  const questions: ClarificationQuestion[] = [];

  const ownersRecord = asObjectRecord(policy.owners);
  const productOwner = asNonEmptyString(ownersRecord?.product);
  if (isUnclearString(productOwner)) {
    addQuestion(
      questions,
      "global.product-owner",
      "medium",
      false,
      "Who approves business-policy updates for this project?",
      "Policy ownership is still unclear; without a named owner, flow requirements can drift across teams.",
    );
  }

  const playwrightContext = asObjectRecord(policy.playwrightContext);
  const baseUrl = asNonEmptyString(playwrightContext?.baseUrl);
  if (isUnclearString(baseUrl) || !isLikelyHttpUrl(baseUrl)) {
    addQuestion(
      questions,
      "global.base-url",
      "high",
      true,
      "What base URL/environment should Playwright use for business-flow execution?",
      "Executable flow tests need a deterministic target environment to avoid testing the wrong deployment.",
    );
  }

  const authStrategy = asNonEmptyString(playwrightContext?.authStrategy);
  if (isUnclearString(authStrategy)) {
    addQuestion(
      questions,
      "global.auth-strategy",
      "high",
      true,
      "What authentication strategy should Playwright use (seeded user, API login, SSO mock, etc.)?",
      "Without a stable auth strategy, flow scaffolds cannot be promoted to implemented tests reliably.",
    );
  }

  const flowsRecord = asObjectRecord(policy.flows) ?? {};
  const knownFlows = Object.keys(flowsRecord).sort((a, b) => a.localeCompare(b));

  if (knownFlows.length === 0) {
    addQuestion(
      questions,
      "global.flows-empty",
      "high",
      true,
      "Which business flows must this project protect with regression checks?",
      "No flows are defined in the policy, so impacted-flow mapping and selective regression cannot run meaningfully.",
    );
  }

  const targetFlows = toSortedUnique(input.flows ?? knownFlows);
  const unknownRequestedFlows = targetFlows.filter((flowId) => !knownFlows.includes(flowId));
  if (unknownRequestedFlows.length > 0) {
    warnings.push(
      `Requested flows are not defined in policy and require clarification: ${unknownRequestedFlows.join(", ")}`,
    );
  }

  const flowMapFlowIds = toSortedUnique(flowMapConfig.mappings.map((entry) => entry.flowId));

  for (const flowId of targetFlows) {
    const flowPolicy = asObjectRecord(flowsRecord[flowId]);

    if (!flowPolicy) {
      addQuestion(
        questions,
        `flow.${flowId}.missing-policy`,
        "high",
        true,
        `What is the business definition for flow '${flowId}'?`,
        "The flow is requested but absent from policy.flows, so regression requirements cannot be derived.",
        flowId,
      );
      continue;
    }

    const userGoal = asNonEmptyString(flowPolicy.userGoal);
    if (isUnclearString(userGoal)) {
      addQuestion(
        questions,
        `flow.${flowId}.user-goal`,
        "medium",
        false,
        `What is the user goal for flow '${flowId}'?`,
        "A clear user goal helps convert policy text into app-level assertions for implemented tests.",
        flowId,
      );
    }

    const mustHold = asStringArrayStrict(flowPolicy.mustHold);
    if (mustHold.length === 0) {
      addQuestion(
        questions,
        `flow.${flowId}.must-hold`,
        "high",
        true,
        `Which invariants must always hold for flow '${flowId}'?`,
        "Implemented tests need non-negotiable business invariants to decide pass/fail outcomes.",
        flowId,
      );
    }

    if (mustHold.length > 0 && containsPlaceholder(mustHold)) {
      addQuestion(
        questions,
        `flow.${flowId}.must-hold-placeholders`,
        "medium",
        false,
        `Can you replace placeholder invariant text for flow '${flowId}' with concrete business invariants?`,
        "Placeholder invariants reduce the value of deterministic business assertions.",
        flowId,
      );
    }

    const minimumCoverage = asStringArrayStrict(flowPolicy.minimumRegressionCoverage);
    if (minimumCoverage.length === 0) {
      addQuestion(
        questions,
        `flow.${flowId}.minimum-coverage`,
        "high",
        true,
        `Which minimum regression scenarios are required for flow '${flowId}'?`,
        "Without minimum coverage items, deterministic suite generation cannot derive required scenarios.",
        flowId,
      );
    }

    if (minimumCoverage.length > 0 && containsPlaceholder(minimumCoverage)) {
      addQuestion(
        questions,
        `flow.${flowId}.minimum-coverage-placeholders`,
        "high",
        true,
        `Can you replace placeholder regression scenarios for flow '${flowId}' with concrete business scenarios?`,
        "Scenario placeholders block deterministic conversion from scaffold tests to implemented checks.",
        flowId,
      );
    }

    const conceptualQuestions = asStringArrayStrict(flowPolicy.conceptualReviewQuestions);
    if (conceptualQuestions.length === 0) {
      addQuestion(
        questions,
        `flow.${flowId}.conceptual-questions`,
        "low",
        false,
        `Which conceptual review questions should guide flow '${flowId}' decisions?`,
        "Conceptual questions improve human review quality when regression output is green but intent is unclear.",
        flowId,
      );
    }

    if (conceptualQuestions.length > 0 && containsPlaceholder(conceptualQuestions)) {
      addQuestion(
        questions,
        `flow.${flowId}.conceptual-placeholders`,
        "low",
        false,
        `Can you replace placeholder conceptual questions for flow '${flowId}' with project-specific review prompts?`,
        "Concrete conceptual prompts improve human review quality and reduce ambiguity.",
        flowId,
      );
    }

    const executionHints = asObjectRecord(flowPolicy.executionHints);
    const entryPath = asNonEmptyString(executionHints?.entryPath);
    if (isUnclearString(entryPath)) {
      addQuestion(
        questions,
        `flow.${flowId}.entry-path`,
        "medium",
        false,
        `Which entry path/screen should Playwright open first for flow '${flowId}'?`,
        "Scaffold tests need a deterministic start point to become executable business checks.",
        flowId,
      );
    }

    const primaryActor = asNonEmptyString(executionHints?.primaryActor);
    if (isUnclearString(primaryActor)) {
      addQuestion(
        questions,
        `flow.${flowId}.primary-actor`,
        "medium",
        false,
        `Which actor/role should execute flow '${flowId}' in regression tests?`,
        "Role ambiguity can hide permission defects and produce flaky assertions.",
        flowId,
      );
    }

    if (!flowMapFlowIds.includes(flowId)) {
      addQuestion(
        questions,
        `flow.${flowId}.file-patterns`,
        "high",
        true,
        `Which changed-file patterns should map to flow '${flowId}' in flow-map.json?`,
        "Without file patterns, impacted-flow detection cannot select this flow when code changes.",
        flowId,
      );
    }

    const mappedSpecs = toSortedUnique(flowSpecMapConfig.flowToSpecs[flowId] ?? []);
    const concreteSpecs = mappedSpecs.filter(
      (specPath) => !specPath.includes("*") && !specPath.includes("?"),
    );
    if (concreteSpecs.length === 0) {
      addQuestion(
        questions,
        `flow.${flowId}.spec-paths`,
        "high",
        true,
        `Which concrete Playwright spec files should cover flow '${flowId}'?`,
        "Flow-to-spec mapping is empty or wildcard-only, so targeted execution cannot be deterministic.",
        flowId,
      );
    }
  }

  return {
    tool: "suggest_policy_clarifications",
    policyPath: resolvedPolicyPath,
    flowMapPath: resolvedFlowMapPath,
    flowSpecMapPath: resolvedFlowSpecMapPath,
    targetFlows,
    questions: sortQuestions(questions),
    warnings: toSortedUnique(warnings),
  };
}
