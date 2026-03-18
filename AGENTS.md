# AGENTS.md

## Goal
Implement an MCP-based regression review workflow for this repository.


## Working rules
- Treat this as a production-facing engineering task, not a demo hack.
- Keep diffs scoped and avoid unrelated refactors.
- Prefer TypeScript for new Node-based tooling unless the repository strongly suggests otherwise.
- Before adding dependencies, explain why they are needed and reuse existing packages when possible.
- If the repo already has conventions for scripts, logging, config, testing, or docs, follow them.


## Implementation expectations
- Build an MCP server that exposes deterministic tools; do not put business reasoning inside the MCP server.
- Claude/Codex-style reasoning belongs in prompts and orchestration, not in the tool layer.
- Playwright should be the execution engine for regression tests on UI flows.
- Organize regression logic around business flows (for example onboarding/offboarding), not only pages/components.
- Keep a static mapping between impacted flows and Playwright specs when possible.
- Prefer simple, inspectable JSON config over hidden heuristics.


## Required MCP tools
Implement or scaffold these tools if missing:
- get_changed_files
- map_impacted_flows
- list_relevant_playwright_specs
- run_playwright
- read_playwright_report
- collect_artifacts
- suggest_missing_tests


## Done criteria
A task is not complete unless all of the following are satisfied:
1. Code compiles or typechecks.
2. Lint passes if configured in the repo.
3. Tests for the modified area pass.
4. Documentation is updated.
5. The final summary includes:
   - files changed
   - commands run
   - validations passed/failed
   - follow-up items


## Validation policy
- After each milestone, run the smallest useful validation first.
- If validation fails, fix it before moving to the next milestone.
- Do not claim success without quoting the exact commands run and their results.


## Documentation
Create and maintain these files if they do not exist:
- docs/ai/regression-mcp-plan.md
- docs/ai/regression-mcp-status.md


The status doc must be updated as work progresses with:
- current milestone
- decisions made
- how to run the new tooling
- known gaps
