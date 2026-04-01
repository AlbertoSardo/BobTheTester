# regression-mcp

Initial MCP server skeleton for deterministic regression review workflows.

## Scope
- Deterministic tools only; no business reasoning in tool handlers.
- Static JSON mapping for changed paths -> business flows -> Playwright specs.
- Playwright execution is safe-by-default (`dryRun: true` unless explicitly disabled).
- Playwright runs emit machine-readable JSON reports at `artifacts/playwright/results.json`.

## Tooling config
- `config/regression/flow-map.json`
- `config/regression/flow-spec-map.json`
- `config/regression/tooling.json`
- `config/regression/code-review-policy.json`
- `docs/flows/test-mapping.json` (human-readable mirror)

## Local development
```bash
npm install
npm exec playwright install chromium
npm run typecheck
npm run build
```

One-command setup from repo root:

```bash
./scripts/setup-bobthetester.sh
```

## Run MCP server (stdio)
```bash
npm run start
```

## Invoke a tool from CLI
```bash
npm run tool -- map_impacted_flows '{"changedFiles":["src/settings/profile/form.ts"]}'
```

## Generate structured regression review output
```bash
npm run review -- '{"changedFiles":["src/settings/profile/form.ts"],"dryRun":false,"project":"chromium"}'
```

`review` is one-shot and deterministic: it maps changed files, generates/updates impacted-flow suite coverage,
validates suite completeness, selects relevant specs, runs Playwright locally, and returns a comprehensive JSON result.

If no specs are selected, Playwright execution is skipped intentionally (no implicit full-suite fallback).
With scaffold-first gating, impacted scenarios marked as `[status:scaffold]` keep suite completeness at `false` until implemented.

## Generate structured code-review output
```bash
npm run code-review -- '{"baseRef":"origin/main","headRef":"HEAD"}'
```

`code-review` runs deterministic checks from `config/regression/code-review-policy.json` and returns
structured findings with severity counts, risk level, and recommended actions.

## Generate unified review output (recommended)
```bash
npm run unified-review -- '{"baseRef":"origin/main","headRef":"HEAD","dryRun":false}'
```

`unified-review` runs deterministic regression + code-review in one command and returns
one combined output with `overallRiskLevel`, `qualityGates`, and consolidated actions.

## Generate/refresh complete Playwright suite from policy
```bash
npm run suite -- '{}'
```

Validate suite completeness:

```bash
npm run tool -- validate_playwright_suite '{}'
```

Get proactive deterministic clarification questions when policy details are unclear:

```bash
npm run tool -- suggest_policy_clarifications '{"flows":["user-onboarding"]}'
```

Placeholder values (`<set-...>`, `TODO`, `TBD`, `to confirm`) are treated as unclear and generate deterministic questions.

Coverage tests are generated with deterministic title markers:
- `[scenario-id:<flow.slug>]`
- `[status:scaffold|implemented]`

Review output format schema:
- `config/regression/review-output.schema.json`

Code-review output format schema:
- `config/regression/code-review-output.schema.json`

Unified output format schema:
- `config/regression/unified-review-output.schema.json`

## Full usage documentation
- `docs/ai/regression-mcp-usage.md`

## Implemented tool names
- `get_changed_files`
- `map_impacted_flows`
- `list_relevant_playwright_specs`
- `generate_playwright_suite`
- `validate_playwright_suite`
- `run_playwright`
- `read_playwright_report`
- `collect_artifacts`
- `suggest_missing_tests`
- `suggest_policy_clarifications`
- `read_business_review_policy`
- `generate_code_review_report`
- `generate_regression_review`
- `generate_unified_review`
