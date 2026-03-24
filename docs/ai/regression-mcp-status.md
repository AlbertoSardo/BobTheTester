# Regression MCP Status

## Current milestone
- `milestone-12 (completed): portable policy template hardening and placeholder-aware clarification gating`

## Decisions made
- Keep MCP tools deterministic and side-effect scoped; no business reasoning inside tools.
- Keep static, inspectable JSON mapping from changed files to business flows to Playwright specs.
- Keep Playwright as the single regression execution engine.
- Keep one slash command entrypoint, `/bobthetester`, backed by deterministic `generate_unified_review`.
- Keep merge decisions human-driven; no auto-merge capability.
- Keep scaffold-first policy as a blocking gate: impacted scenarios with `status:scaffold` fail regression quality gates.
- Keep clarification prompts deterministic: missing policy execution details return targeted `clarificationQuestions` instead of hidden heuristics.
- Treat placeholder policy values (`<set-...>`, `TODO`, `TBD`, `to confirm`) as unclear input that should trigger proactive clarification questions.

## Progress log
- Scaffolded and hardened `tools/regression-mcp/` as a standalone TypeScript MCP package.
- Implemented required deterministic tools and unified orchestration outputs for regression + code review.
- Completed clean-cut Playwright migration:
  - tool contracts moved to `*_playwright_*` naming,
  - flow specs moved to `playwright/e2e/flows/*.spec.ts`,
  - output contract now uses `runnerStatus`.
- Added deterministic suite generation and validation gates before execution.
- Added deterministic scaffold markers for generated scenarios (`[scenario-id:...]`, `[status:scaffold|implemented]`).
- Extended suite validation to classify `implemented` vs `scaffold` scenario coverage per flow.
- Updated regression/unified gates so scaffold-only impacted flows produce `riskLevel: high` and `combinedGatePassed: false`.
- Added `suggest_policy_clarifications` tool to surface project-specific policy gaps as targeted questions.
- Updated regression review output with `clarificationQuestions` so orchestrators can ask proactive follow-up questions when context is missing.
- Hardened `business-review-policy` with explicit `playwrightContext` and per-flow `executionHints` fields for cross-project onboarding.
- Added placeholder-aware detection in clarification logic so template values are not treated as valid execution inputs.
- Updated command/docs wiring so `/bobthetester` maps to unified deterministic output.
- Removed legacy runner artifacts and updated ignore/runtime setup for Playwright.
- Normalized plan/status docs to Playwright-only terminology and aligned milestone/validation records with current execution paths.

## Latest validation snapshot
- Run from `tools/regression-mcp/`:
  - `npm run typecheck && npm run build` -> pass.
  - `npm run suite -- '{}'` -> pass (normalized scenario markers in all mapped flow specs).
  - `npm run suite:check -- '{}'` -> pass command; output `isComplete: false` with all flows in `scaffoldFlows` (expected under scaffold-first blocking policy).
  - `npm run tool -- suggest_policy_clarifications '{"flows":["user-onboarding"]}'` -> pass (returns targeted blocking/non-blocking questions when placeholder values are present).
  - `npm run tool -- run_playwright '{"specs":["playwright/e2e/flows/user-onboarding.spec.ts"],"dryRun":false,"browser":"chromium"}'` -> pass (`4 passed`).
  - `npm run unified-review -- '{"changedFiles":["src/features/user-onboarding/step.ts"],"dryRun":false,"browser":"chromium"}'` -> pass command; output includes `clarificationQuestions`, `overallRiskLevel: high`, `suiteCompletenessGatePassed: false`, `combinedGatePassed: false` (expected while impacted scenarios are scaffold-only and policy execution context is incomplete).

## How to run the tooling
- From `tools/regression-mcp/`:
  - `npm install`
  - `npm run typecheck`
  - `npm run build`
  - `npm run suite -- '{}'`
  - `npm run suite:check -- '{}'`
  - `npm run tool -- suggest_policy_clarifications '<json_input>'`
  - `npm run start`
  - `npm run tool -- <tool_name> '<json_input>'`
  - `npm run unified-review -- '<json_input>'`
  - `npm run review -- '<json_input>'`
  - `npm run code-review -- '<json_input>'`
- Regression execution is intentionally skipped when selected specs are empty.

## Known gaps
- Root-level workspace and CI conventions are still not fully discoverable in this repository snapshot.
- Current Playwright flow scenarios are scaffold placeholders; quality gates stay blocked until status is promoted to `implemented` with real assertions.
- `read_playwright_report` is fully implemented for JSON; JUnit/line parser modes remain typed TODO stubs.
- CI artifact retention and naming policy are documented but not yet enforced by a committed CI pipeline.
- Code-review extension policy may need refinement for non-standard stacks.
