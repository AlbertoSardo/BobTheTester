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

## Validation plan for milestone 9
- From `tools/regression-mcp/`:
  - `npm run typecheck`
  - `npm run build`
  - `npm run tool -- run_playwright '{"specs":["playwright/e2e/flows/user-onboarding.spec.ts"],"dryRun":false,"browser":"chromium"}'`
  - `npm run tool -- read_playwright_report '{}'`
  - `npm run unified-review -- '{"changedFiles":["src/features/user-onboarding/step.ts"],"dryRun":false,"browser":"chromium"}'`

## Risks and follow-ups
- Flow mappings may drift from product behavior as features evolve.
- Current flow specs are deterministic placeholders until real app assertions/fixtures are added.
- CI workflow is documented but not yet committed as executable pipeline.
- JUnit/line parsing remains stubbed while JSON report parsing is fully implemented.
