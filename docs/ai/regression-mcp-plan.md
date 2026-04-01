# MCP Regression Review Workflow Plan

## Goal
- Keep `/bobthetester` as the single deterministic command for regression + code review.
- Keep MCP tools deterministic and data-oriented; business reasoning stays in prompt/orchestration.
- Use Playwright as the only UI regression execution engine.

## Current architecture
- **Orchestration**: one-shot `generate_unified_review` combines regression and code-review outputs with `overallRiskLevel`.
- **Regression pipeline**: changed files -> impacted flows -> relevant specs -> suite generation/validation -> targeted Playwright run -> report/artifacts -> missing-test suggestions.
- **Static config**: inspectable JSON under `config/regression/` drives mappings and policies.
- **Determinism**: no implicit full-suite fallback when no mapped specs are selected.
- **Scaffold-first contract**: generated scenario tests include deterministic markers (`scenario-id`, `status`) and keep gate blocked while status is `scaffold`.

## Required MCP tools (implemented)
- `get_changed_files`
- `map_impacted_flows`
- `list_relevant_playwright_specs`
- `run_playwright`
- `read_playwright_report`
- `collect_artifacts`
- `suggest_missing_tests`

## Additional deterministic tools
- `generate_playwright_suite`
- `validate_playwright_suite`
- `suggest_policy_clarifications`
- `generate_regression_review`
- `generate_code_review_report`
- `generate_unified_review`
- `read_business_review_policy`

## Milestones
- **Milestone 1 (done)**: scaffolded `tools/regression-mcp` TypeScript package, MCP server bootstrap, typed tool contracts.
- **Milestone 2 (done)**: deterministic file->flow->spec mapping tools and config structure.
- **Milestone 3 (done)**: Playwright execution tooling, report parsing, artifact collection.
- **Milestone 4 (done)**: regression output schema + missing-test suggestions.
- **Milestone 5 (done)**: deterministic CLI entrypoints (`tool`, `review`, `code-review`, `unified-review`) and docs.
- **Milestone 6 (done)**: business-policy-driven suite generation and completeness validation.
- **Milestone 7 (done)**: dedicated deterministic code-review gate and schema.
- **Milestone 8 (done)**: unified one-shot output contract + single slash command wiring.
- **Milestone 9 (done)**: documentation hardening and final validation sweep after Playwright clean-cut migration.
- **Milestone 10 (done)**: scaffold-first suite model with deterministic scenario status markers and blocking quality gate.
- **Milestone 11 (done)**: policy-driven clarification questions for portable cross-project onboarding (`suggest_policy_clarifications`).
- **Milestone 12 (done)**: policy template hardening with explicit Playwright context/execution hints and placeholder-aware clarification detection.

## Validation plan for milestone 12
- From `tools/regression-mcp/`:
  - `npm run typecheck`
  - `npm run build`
  - `npm run tool -- suggest_policy_clarifications '{"flows":["user-onboarding"]}'`
  - `npm run tool -- run_playwright '{"specs":["playwright/e2e/flows/user-onboarding.spec.ts"],"dryRun":false,"project":"chromium"}'`
  - `npm run tool -- read_playwright_report '{}'`
  - `npm run unified-review -- '{"changedFiles":["src/features/user-onboarding/step.ts"],"dryRun":false,"project":"chromium"}'`

## Risks and follow-ups
- Flow mappings may drift from product behavior as features evolve.
- Current flow specs are deterministic placeholders until real app assertions/fixtures are added.
- Scenario status promotion (`scaffold` -> `implemented`) still relies on disciplined spec updates per flow.
- Clarification quality depends on policy structure (`playwrightContext` and `executionHints` are optional but recommended).
- Placeholder policy values are intentionally treated as unclear to force explicit project onboarding decisions.
- CI workflow is documented but not yet committed as executable pipeline.
- JUnit/line parsing remains stubbed while JSON report parsing is fully implemented.
