# Regression MCP Status

## Current milestone
- `milestone-9 (completed): post-migration documentation hardening and final validation`

## Decisions made
- Keep MCP tools deterministic and side-effect scoped; no business reasoning inside tools.
- Keep static, inspectable JSON mapping from changed files to business flows to Playwright specs.
- Keep Playwright as the single regression execution engine.
- Keep one slash command entrypoint, `/bobthetester`, backed by deterministic `generate_unified_review`.
- Keep merge decisions human-driven; no auto-merge capability.

## Progress log
- Scaffolded and hardened `tools/regression-mcp/` as a standalone TypeScript MCP package.
- Implemented required deterministic tools and unified orchestration outputs for regression + code review.
- Completed clean-cut Playwright migration:
  - tool contracts moved to `*_playwright_*` naming,
  - flow specs moved to `playwright/e2e/flows/*.spec.ts`,
  - output contract now uses `runnerStatus`.
- Added deterministic suite generation and validation gates before execution.
- Updated command/docs wiring so `/bobthetester` maps to unified deterministic output.
- Removed legacy runner artifacts and updated ignore/runtime setup for Playwright.
- Normalized plan/status docs to Playwright-only terminology and aligned milestone/validation records with current execution paths.

## Latest validation snapshot
- Run from `tools/regression-mcp/`:
  - `npm run typecheck && npm run build` -> pass.
  - `npm run suite:check -- '{}'` -> pass (`isComplete: true`, no incomplete flows).
  - `npm run unified-review -- '{"changedFiles":["src/features/user-onboarding/step.ts"],"dryRun":true,"browser":"chromium"}'` -> pass (`overallRiskLevel: medium`, `combinedGatePassed: true`, runner skipped by dry-run policy).
  - `npm run unified-review -- '{"changedFiles":["src/features/user-onboarding/step.ts"],"dryRun":false,"browser":"chromium"}'` -> pass (`overallRiskLevel: low`, `combinedGatePassed: true`, Playwright `4 passed / 0 failed`).

## How to run the tooling
- From `tools/regression-mcp/`:
  - `npm install`
  - `npm run typecheck`
  - `npm run build`
  - `npm run start`
  - `npm run tool -- <tool_name> '<json_input>'`
  - `npm run unified-review -- '<json_input>'`
  - `npm run review -- '<json_input>'`
  - `npm run code-review -- '<json_input>'`
- Regression execution is intentionally skipped when selected specs are empty.

## Known gaps
- Root-level workspace and CI conventions are still not fully discoverable in this repository snapshot.
- Current Playwright flow specs are deterministic placeholders until real app fixtures/assertions are integrated.
- `read_playwright_report` is fully implemented for JSON; JUnit/line parser modes remain typed TODO stubs.
- CI artifact retention and naming policy are documented but not yet enforced by a committed CI pipeline.
- Code-review extension policy may need refinement for non-standard stacks.
