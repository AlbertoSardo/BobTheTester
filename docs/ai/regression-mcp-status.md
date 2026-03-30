# Regression MCP Status

## Current milestone
- `milestone-13 (completed): code quality hardening, architecture cleanup, and tooling ergonomics`

## Decisions made
- Keep MCP tools deterministic and side-effect scoped; no business reasoning inside tools.
- Keep static, inspectable JSON mapping from changed files to business flows to Playwright specs.
- Keep Playwright as the single regression execution engine.
- Keep one slash command entrypoint, `/bobthetester`, backed by deterministic `generate_unified_review`.
- Keep merge decisions human-driven; no auto-merge capability.
- Keep scaffold-first policy as a blocking gate: impacted scenarios with `status:scaffold` fail regression quality gates.
- Keep clarification prompts deterministic: missing policy execution details return targeted `clarificationQuestions` instead of hidden heuristics.
- Treat placeholder policy values (`<set-...>`, `TODO`, `TBD`, `to confirm`) as unclear input that should trigger proactive clarification questions.
- Use `.git/` as repository root marker instead of `AGENTS.md` for reliability.
- JSON output schemas are reference-only documentation; no runtime validation (avoids extra dependencies).
- ESLint (strict TypeScript) + Prettier are enforced on all source code.

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
- **milestone-13**: Code quality hardening and architecture cleanup:
  - Fixed `findRepositoryRoot` to use `.git/` as marker instead of fragile `AGENTS.md` dependency.
  - Fixed potential regex stateful bug in `generate_code_review_report` (reset `lastIndex` before each `.test()` call).
  - Consolidated duplicated helper functions (`uniqueSorted`, `asObjectRecord`, `asStringArray`) into shared `src/utils/helpers.ts`.
  - Removed duplicated `escapeDoubleQuotedString` in favor of existing `escapeForQuote`.
  - Removed legacy Cypress directories (`cypress/`, `artifacts/cypress/`) and stale compiled artifacts from `dist/`.
  - Added ESLint (strict TypeScript + Prettier) configuration; all source code passes lint.
  - Added root-level `package.json` with proxy scripts for ergonomic invocation without `--prefix`.
  - Improved `read_playwright_report` to return explicit `unsupported-format` status instead of silent `stub` for non-JSON formats.
  - Documented JSON output schemas as reference-only (added `$comment` to all 3 schema files).
  - Parallelized independent orchestration steps in `review.ts` using `Promise.all()` for better performance.

## Latest validation snapshot
- Run from project root or `tools/regression-mcp/`:
  - `npm run typecheck` -> pass.
  - `npm run build` -> pass.
  - `npm run lint` -> pass (0 errors, 0 warnings).
  - `npm run format:check` -> pass.
  - `npm run suite -- '{}'` -> pass (normalized scenario markers in all mapped flow specs).
  - `npm run suite:check -- '{}'` -> pass command; output `isComplete: false` with all flows in `scaffoldFlows` (expected under scaffold-first blocking policy).
  - `npm run tool -- suggest_policy_clarifications '{"flows":["user-onboarding"]}'` -> pass (returns targeted blocking/non-blocking questions when placeholder values are present).

## How to run the tooling
- From **project root** (proxy scripts):
  - `npm run build`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run format`
  - `npm run tool -- <tool_name> '<json_input>'`
  - `npm run unified-review -- '<json_input>'`
  - `npm run review -- '<json_input>'`
  - `npm run code-review -- '<json_input>'`
  - `npm run suite`
  - `npm run suite:check`
- From `tools/regression-mcp/` (direct):
  - `npm install`
  - `npm run start` (MCP server via stdio)
  - All scripts above plus `npm run lint:fix`, `npm run format:check`
- Regression execution is intentionally skipped when selected specs are empty.

## Known gaps
- Current Playwright flow scenarios are scaffold placeholders; quality gates stay blocked until status is promoted to `implemented` with real assertions.
- `read_playwright_report` is fully implemented for JSON; JUnit/line formats return `unsupported-format` status with clear guidance.
- CI artifact retention and naming policy are documented but not yet enforced by a committed CI pipeline.
- Code-review extension policy may need refinement for non-standard stacks.
- No unit/integration tests for the MCP tool implementations themselves (only Playwright scaffold specs exist).
