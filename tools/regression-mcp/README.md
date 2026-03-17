# regression-mcp

Initial MCP server skeleton for deterministic regression review workflows.

## Scope
- Deterministic tools only; no business reasoning in tool handlers.
- Static JSON mapping for changed paths -> business flows -> Cypress specs.
- Cypress execution is safe-by-default (`dryRun: true` unless explicitly disabled).
- Cypress runs emit machine-readable JSON reports at `artifacts/cypress/results.json`.

## Tooling config
- `config/regression/flow-map.json`
- `config/regression/flow-spec-map.json`
- `config/regression/tooling.json`
- `docs/flows/test-mapping.json` (human-readable mirror)

## Local development
```bash
npm install
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
npm run review -- '{"changedFiles":["src/settings/profile/form.ts"],"dryRun":false,"browser":"electron"}'
```

`review` is one-shot and deterministic: it maps changed files, generates/updates impacted-flow suite coverage,
validates suite completeness, selects relevant specs, runs Cypress locally, and returns a comprehensive JSON result.

If no specs are selected, Cypress execution is skipped intentionally (no implicit full-suite fallback).

## Generate/refresh complete Cypress suite from policy
```bash
npm run suite -- '{}'
```

Validate suite completeness:

```bash
npm run tool -- validate_cypress_suite '{}'
```

Review output format schema:
- `config/regression/review-output.schema.json`

## Full usage documentation
- `docs/ai/regression-mcp-usage.md`

## Implemented tool names
- `get_changed_files`
- `map_impacted_flows`
- `list_relevant_cypress_specs`
- `generate_cypress_suite`
- `validate_cypress_suite`
- `run_cypress`
- `read_cypress_report`
- `collect_artifacts`
- `suggest_missing_tests`
- `read_business_review_policy`
- `generate_regression_review`
