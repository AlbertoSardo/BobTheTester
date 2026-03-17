# Regression MCP Usage Guide

## One-command setup
From repository root:

```bash
./scripts/setup-bobthetester.sh
```

This installs/builds MCP tooling and generates Claude MCP snippet at:

- `~/.config/tiware/bobthetester/claude-mcp-server.local.json`

Optional direct merge into Claude Desktop config:

```bash
./scripts/setup-bobthetester.sh --write-desktop-config
```

## Start the MCP server
From the repository root:

```bash
npm --prefix tools/regression-mcp install
npm --prefix tools/regression-mcp run build
npm --prefix tools/regression-mcp run start
```

This starts the stdio MCP server implemented in `tools/regression-mcp/src/server.ts`.

## Claude slash command
Custom command path:

- `.claude/commands/bobthetester.md`

If your Claude client supports repository commands, run:

```text
/bobthetester
```

Dedicated deterministic code-review command:

```text
/bobcodereview
```

Optional JSON input:

```text
/bobthetester {"changedFiles":["src/features/user-onboarding/step.ts"],"dryRun":false}
```

```text
/bobcodereview {"baseRef":"origin/main","headRef":"HEAD"}
```

Default behavior for `/bobthetester` is local execution (`dryRun:false`) unless explicitly overridden.

## Invoke each tool locally (deterministic CLI wrapper)
All commands below run from repository root and return JSON.

### `get_changed_files`
```bash
npm --prefix tools/regression-mcp run tool -- get_changed_files '{"baseRef":"origin/main","headRef":"HEAD","includeUntracked":true}'
```

### `map_impacted_flows`
```bash
npm --prefix tools/regression-mcp run tool -- map_impacted_flows '{"changedFiles":["src/features/user-onboarding/step.ts","src/settings/profile/form.ts"]}'
```

### `list_relevant_cypress_specs`
```bash
npm --prefix tools/regression-mcp run tool -- list_relevant_cypress_specs '{"impactedFlowIds":["user-onboarding","profile-edit"]}'
```

### `generate_cypress_suite`
Generate or refresh complete suite coverage from policy:

```bash
npm --prefix tools/regression-mcp run tool -- generate_cypress_suite '{}'
```

Only selected flows:

```bash
npm --prefix tools/regression-mcp run tool -- generate_cypress_suite '{"flows":["user-onboarding","permission-change"]}'
```

Shortcut command:

```bash
npm --prefix tools/regression-mcp run suite -- '{}'
```

### `validate_cypress_suite`
Validate if policy-required suite coverage is complete:

```bash
npm --prefix tools/regression-mcp run tool -- validate_cypress_suite '{}'
```

Validate selected flows only:

```bash
npm --prefix tools/regression-mcp run tool -- validate_cypress_suite '{"flows":["user-onboarding","permission-change"]}'
```

### `run_cypress`
Dry run (safe preview):

```bash
npm --prefix tools/regression-mcp run tool -- run_cypress '{"specs":["cypress/e2e/flows/user-onboarding.cy.js"],"dryRun":true}'
```

Real run:

```bash
npm --prefix tools/regression-mcp run tool -- run_cypress '{"specs":["cypress/e2e/flows/user-onboarding.cy.js"],"dryRun":false,"browser":"electron"}'
```

### `read_cypress_report`
```bash
npm --prefix tools/regression-mcp run tool -- read_cypress_report '{}'
```

### `collect_artifacts`
```bash
npm --prefix tools/regression-mcp run tool -- collect_artifacts '{}'
```

### `suggest_missing_tests`
```bash
npm --prefix tools/regression-mcp run tool -- suggest_missing_tests '{"impactedFlowIds":["profile-edit","billing"],"unmappedFiles":["src/billing/invoice.ts"]}'
```

### `read_business_review_policy`
```bash
npm --prefix tools/regression-mcp run tool -- read_business_review_policy '{}'
```

### `generate_regression_review`
```bash
npm --prefix tools/regression-mcp run tool -- generate_regression_review '{"changedFiles":["src/settings/profile/form.ts"],"dryRun":false,"browser":"electron"}'
```

This one-shot command now includes deterministic sub-steps for impacted flows:
- `generate_cypress_suite`
- `validate_cypress_suite`
- Cypress execution only on selected specs

If no specs are selected, Cypress execution is skipped intentionally (no implicit full-suite run).

### `generate_code_review_report`
```bash
npm --prefix tools/regression-mcp run tool -- generate_code_review_report '{"baseRef":"origin/main","headRef":"HEAD","includeUntracked":false}'
```

Shortcut command:

```bash
npm --prefix tools/regression-mcp run code-review -- '{"baseRef":"origin/main","headRef":"HEAD","includeUntracked":false}'
```

This returns deterministic findings based on:
- sensitive path rules
- added-line pattern checks
- change-size thresholds

Rules live in:

- `config/regression/code-review-policy.json`

## Configure flow-to-spec mapping
Deterministic mapping lives in:

- `config/regression/flow-map.json` (`changed files -> flow IDs`)
- `config/regression/flow-spec-map.json` (`flow IDs -> Cypress spec paths`)
- `config/regression/business-review-policy.json` (criteri concettuali e product-flow review)

Human-readable mirror:

- `docs/flows/test-mapping.json`

Recommended update flow:
1. Add or update file patterns under a business flow in `config/regression/flow-map.json`.
2. Ensure each flow has one or more concrete specs in `config/regression/flow-spec-map.json`.
3. Keep `docs/flows/test-mapping.json` in sync for reviewers.
4. Update conceptual checks in `config/regression/business-review-policy.json` when business expectations change.

## Run targeted regression checks locally
Use the structured orchestrated command:

```bash
npm --prefix tools/regression-mcp run review -- '{"changedFiles":["src/features/user-onboarding/step.ts","src/settings/profile/form.ts"],"dryRun":false,"browser":"electron"}'
```

Git-diff driven mode:

```bash
npm --prefix tools/regression-mcp run review -- '{"baseRef":"origin/main","headRef":"HEAD","includeUntracked":true,"dryRun":false}'
```

## Structured review output format
The `review` command returns a deterministic JSON object with:

- `mapping`
- `impactedFlows`
- `suiteGeneration`
- `suiteCompleteness`
- `selectedSpecs`
- `passFailSummary`
- `failedTests`
- `artifactPaths`
- `suggestedMissingTests`
- `riskLevel`

Schema:

- `config/regression/review-output.schema.json`
- `config/regression/code-review-output.schema.json`

Example (shape only):

```json
{
  "version": 1,
  "generatedAt": "2026-03-16T00:00:00.000Z",
  "mapping": {
    "fileToFlows": {
      "src/settings/profile/form.ts": ["profile-edit"]
    },
    "unmappedFiles": []
  },
  "impactedFlows": ["profile-edit"],
  "suiteGeneration": {
    "targetFlows": ["profile-edit"],
    "createdSpecFiles": [],
    "updatedSpecFiles": [],
    "unchangedSpecFiles": ["cypress/e2e/flows/profile-edit.cy.js"],
    "mappingUpdated": false
  },
  "suiteCompleteness": {
    "isComplete": true,
    "incompleteFlows": []
  },
  "selectedSpecs": ["cypress/e2e/flows/profile-edit.cy.js"],
  "passFailSummary": {
    "cypressStatus": "passed",
    "exitCode": 0,
    "totals": {
      "tests": 1,
      "passed": 1,
      "failed": 0,
      "skipped": 0,
      "pending": 0,
      "durationMs": 30
    }
  },
  "failedTests": [],
  "artifactPaths": {
    "screenshots": [],
    "failedScreenshots": [],
    "videos": ["cypress/videos/profile-edit.cy.js.mp4"],
    "failedVideos": [],
    "reports": ["artifacts/cypress/results.json"]
  },
  "suggestedMissingTests": {
    "flowsWithoutSpecs": [],
    "unmappedFiles": [],
    "suggestions": []
  },
  "riskLevel": "low"
}
```

## Interpret the output
- `riskLevel=low`: impacted flows mapped, specs selected, and no failures.
- `riskLevel=medium`: missing mappings/spec coverage or regression run skipped for impacted flows.
- `riskLevel=high`: test failures, or impacted flows with no selected specs.
- `riskLevel=critical`: failures + coverage gaps at the same time.

For code-review output:
- `riskLevel=low`: no deterministic findings.
- `riskLevel=medium`: only medium/low findings.
- `riskLevel=high`: at least one high-severity finding.
- `riskLevel=critical`: multiple high-severity findings, or high + multiple medium findings.

## Minimal CI integration path
No CI configuration is currently present in this repository snapshot. For CI, run only the targeted regression command as a focused step:

```bash
npm --prefix tools/regression-mcp install
npm --prefix tools/regression-mcp run build
npm --prefix tools/regression-mcp run review -- '{"baseRef":"origin/main","headRef":"HEAD","includeUntracked":true,"dryRun":false}'
```

This keeps the CI path small and deterministic while avoiding broad full-suite runs.

For separate PR gates, run both commands as independent checks:

```bash
npm --prefix tools/regression-mcp run review -- '{"baseRef":"origin/main","headRef":"HEAD","includeUntracked":false,"dryRun":false}'
npm --prefix tools/regression-mcp run code-review -- '{"baseRef":"origin/main","headRef":"HEAD","includeUntracked":false}'
```
