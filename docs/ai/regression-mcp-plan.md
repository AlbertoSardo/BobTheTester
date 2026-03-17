# MCP Regression Review Workflow Plan

## Repository discovery snapshot
- Scan date: 2026-03-16.
- Files present: `AGENTS.md`.
- Missing from current workspace: package manager files (`package.json`, lockfiles), Cypress config/specs, CI workflows, and existing project docs.
- Planning implication: this plan defines a deterministic architecture and phased implementation, with explicit open questions to resolve once the full repository contents are available.

## 1) Concise architecture summary
- **Orchestrator (reasoning layer)**: decides *why* a flow is relevant, calls MCP tools in sequence, and produces the final regression review narrative.
- **MCP server (deterministic tool layer)**: exposes stable, side-effect-scoped tools with explicit inputs/outputs and no business reasoning heuristics.
- **Static config mapping**: JSON maps source-path patterns -> business flows -> Cypress specs, so tool behavior is inspectable and reproducible.
- **Cypress execution adapter**: runs selected specs and returns normalized run metadata, report paths, exit code, and artifact locations.
- **Report/Artifact parsers**: parse machine outputs into structured JSON for the orchestrator summary (`passed`, `failed`, failure reasons, screenshots/videos, coverage gaps).

### MCP tool responsibilities (deterministic contracts)
- `get_changed_files`: returns changed files for a given git range/base ref.
- `map_impacted_flows`: maps changed files to flow IDs from static mapping config.
- `list_relevant_cypress_specs`: resolves impacted flow IDs to Cypress spec paths.
- `run_cypress`: executes Cypress for selected specs, returns structured run metadata.
- `read_cypress_report`: parses Cypress/mocha/junit/json output into normalized results.
- `collect_artifacts`: lists screenshots/videos/traces for failed scenarios.
- `suggest_missing_tests`: highlights impacted flows with no mapped specs and changed paths with no flow mapping.

## 2) Milestone-by-milestone implementation plan

### Milestone 1 - Project scaffold and deterministic config model
- Create MCP package/module scaffold in TypeScript (unless repo conventions require another location).
- Define JSON schemas/types for flow and spec mapping.
- Add baseline config files with onboarding/offboarding examples.
- Add minimal scripts for typecheck/lint/test where repo conventions support them.

### Milestone 2 - Mapping tools
- Implement `get_changed_files`.
- Implement `map_impacted_flows` using static config only.
- Implement `list_relevant_cypress_specs` with deterministic ordering/dedup.
- Add unit tests using fixed fixtures for changed-files and mapping.

### Milestone 3 - Cypress execution and parsing tools
- Implement `run_cypress` with explicit command/result schema.
- Implement `read_cypress_report` for configured report format.
- Implement `collect_artifacts` for screenshots/videos.
- Add integration-style tests with mocked Cypress outputs.

### Milestone 4 - Gap analysis and review output contract
- Implement `suggest_missing_tests` using config/report data only.
- Define structured regression review JSON contract for orchestrator consumption.
- Add fixtures covering regressions found vs. missing-test scenarios.

### Milestone 5 - Orchestrator wiring and docs
- Add orchestrator workflow doc with tool call sequence.
- Add runnable example command/script for local and CI usage.
- Update status docs with decisions, known gaps, and runbook.

### Milestone 6 - CI integration and hardening
- Add CI job to run selective regression flow (changed-files -> mapped specs -> Cypress run -> summary artifact).
- Add fail conditions (e.g., failed mapped specs, parser errors) and non-blocking warnings (missing mappings/tests).
- Validate deterministic outputs and artifact retention.

## 3) Proposed file/folder layout
```text
docs/
  ai/
    regression-mcp-plan.md
    regression-mcp-status.md

config/
  regression/
    flow-map.json              # changed path patterns -> flow IDs
    flow-spec-map.json         # flow IDs -> Cypress spec paths
    tooling.json               # report/artifact locations and execution defaults

tools/
  regression-mcp/
    src/
      server.ts
      types.ts
      tools/
        get-changed-files.ts
        map-impacted-flows.ts
        list-relevant-cypress-specs.ts
        run-cypress.ts
        read-cypress-report.ts
        collect-artifacts.ts
        suggest-missing-tests.ts
      utils/
        git.ts
        config-loader.ts
        cypress-command.ts
        report-parser.ts
    test/
      fixtures/
      unit/
      integration/
```

## 4) Assumptions and risks

### Assumptions
- Node.js tooling is acceptable and TypeScript is preferred for new implementation.
- Cypress will be (or become) the canonical UI regression engine.
- Flow/spec mappings can be represented as static JSON and versioned in-repo.
- Orchestrator can consume structured JSON from MCP tools.

### Risks
- Current workspace lacks existing project/tooling files, so path/package/CI conventions are unknown.
- Static mappings can drift as product flows/spec files evolve.
- Cypress flakiness can reduce signal quality without retry/timeout standards.
- Report format differences (mocha/junit/json) can break parsing if not standardized.
- Missing or weak flow taxonomy can produce false positives/negatives in impacted-flow inference.

## 5) Exact validation commands after each milestone
Assuming npm conventions for now (replace with repo-native package manager once confirmed).

### Milestone 1
- `npm run typecheck`
- `npm run lint`

### Milestone 2
- `npm run test -- tools/regression-mcp/test/unit/map-impacted-flows.test.ts`
- `npm run test -- tools/regression-mcp/test/unit/list-relevant-cypress-specs.test.ts`
- `npm run typecheck`

### Milestone 3
- `npm run test -- tools/regression-mcp/test/integration/run-cypress.test.ts`
- `npm run test -- tools/regression-mcp/test/integration/read-cypress-report.test.ts`
- `npm run typecheck`

### Milestone 4
- `npm run test -- tools/regression-mcp/test/unit/suggest-missing-tests.test.ts`
- `npm run test -- tools/regression-mcp/test/integration/review-summary-contract.test.ts`
- `npm run typecheck`

### Milestone 5
- `npm run regression:mcp -- --base origin/main --head HEAD --dry-run`
- `npm run typecheck`

### Milestone 6
- `npm run regression:mcp -- --base origin/main --head HEAD`
- `npm run cypress -- --spec "<comma-separated-specs-from-tool>"`
- `npm run lint && npm run typecheck && npm test`

## 6) Open questions to resolve before implementation
- Which package manager/scripts are canonical in this repository?
- Where should MCP code live (single app vs. monorepo package)?
- Which Cypress report format is already standardized (if any)?
- What CI system and artifact retention conventions should be followed?
- What is the approved initial flow taxonomy beyond onboarding/offboarding?
