import { generateRegressionReview } from "./review.js";
import { evaluatePolicyCoverage } from "./tools/evaluate-policy-coverage.js";
import type { RegressionReviewOutput, RiskLevel, UnifiedReviewInput, UnifiedReviewOutput } from "./types.js";
import { uniqueSorted } from "./utils/helpers.js";

function riskPriority(level: RiskLevel): number {
  if (level === "critical") {
    return 4;
  }

  if (level === "high") {
    return 3;
  }

  if (level === "medium") {
    return 2;
  }

  return 1;
}

function maxRiskLevel(levels: RiskLevel[]): RiskLevel {
  let current: RiskLevel = "low";

  for (const level of levels) {
    if (riskPriority(level) > riskPriority(current)) {
      current = level;
    }
  }

  return current;
}

function deriveRegressionActions(review: RegressionReviewOutput): string[] {
  const actions: string[] = [];

  if (!review.suiteCompleteness.isComplete) {
    actions.push("Complete missing regression suite coverage for all incomplete impacted flows.");
  }

  if (review.suiteCompleteness.scaffoldFlows.length > 0) {
    actions.push(
      "Replace scaffold-only scenarios with implemented Playwright assertions for impacted flows before merge.",
    );
  }

  if (review.clarificationQuestions.length > 0) {
    actions.push(
      "Answer targeted policy clarification questions to make regression requirements project-specific and executable.",
    );
  }

  if (review.passFailSummary.totals.failed > 0) {
    actions.push("Fix failing Playwright tests before merge.");
  }

  if (review.suggestedMissingTests.unmappedFiles.length > 0) {
    actions.push("Update flow mapping for changed files that are currently unmapped.");
  }

  if (review.suggestedMissingTests.flowsWithoutSpecs.length > 0) {
    actions.push("Add Playwright specs for impacted flows that currently have no mapped spec files.");
  }

  if (review.suggestedMissingTests.suggestions.length > 0) {
    actions.push("Review and address deterministic missing-test suggestions from the regression analysis.");
  }

  if (review.passFailSummary.runnerStatus === "skipped" && review.impactedFlows.length > 0) {
    actions.push("Investigate why impacted flows produced no selected specs before merge.");
  }

  if (actions.length === 0) {
    actions.push("No regression blockers detected. Keep normal human validation before merge.");
  }

  return uniqueSorted(actions);
}

export async function generateUnifiedReview(input: UnifiedReviewInput = {}): Promise<UnifiedReviewOutput> {
  const includeUntracked = input.includeUntracked ?? true;
  const dryRun = input.dryRun ?? false;

  const regressionReview = await generateRegressionReview({
    ...input,
    policyPath: input.regressionPolicyPath ?? input.policyPath,
    includeUntracked,
    dryRun,
  });

  const policyCoverage = await evaluatePolicyCoverage({
    changedFiles: regressionReview.inputs.changedFiles,
    policyPath: input.policyPath,
    flowMapPath: input.flowMapPath,
    flowSpecMapPath: input.flowSpecMapPath,
    repoRoot: regressionReview.repoRoot,
  });

  const overallRiskLevel = maxRiskLevel([regressionReview.riskLevel, policyCoverage.riskLevel]);

  const overallRecommendedActions = uniqueSorted([
    ...deriveRegressionActions(regressionReview),
    ...policyCoverage.recommendedActions,
  ]);

  const suiteCompletenessGatePassed = regressionReview.suiteCompleteness.isComplete;
  const regressionRiskGatePassed =
    regressionReview.riskLevel === "low" || regressionReview.riskLevel === "medium";
  const policyCoverageGatePassed = policyCoverage.coverageGatePassed;

  const qualityGates = {
    suiteCompletenessGatePassed,
    policyCoverageGatePassed,
    regressionRiskGatePassed,
    combinedGatePassed: suiteCompletenessGatePassed && policyCoverageGatePassed && regressionRiskGatePassed,
  };

  return {
    tool: "generate_unified_review",
    version: 1,
    generatedAt: new Date().toISOString(),
    repoRoot: regressionReview.repoRoot,
    inputs: {
      baseRef: input.baseRef,
      headRef: input.headRef,
      includeUntracked,
      changedFiles: regressionReview.inputs.changedFiles,
      dryRun,
    },
    regressionReview,
    policyCoverage,
    overallRiskLevel,
    overallRecommendedActions,
    qualityGates,
    warnings: uniqueSorted([...regressionReview.warnings, ...policyCoverage.warnings]),
  };
}
