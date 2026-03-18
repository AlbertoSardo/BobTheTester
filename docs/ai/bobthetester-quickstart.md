# BobTheTester Quickstart

## Goal
Install from GitHub, enable MCP in Claude, then run `/bobthetester` with minimal manual setup.

## 1) Clone and run one-command setup
```bash
git clone <your-github-url>
cd BobTheTester
./scripts/setup-bobthetester.sh
```

This command:
- installs/builds `tools/regression-mcp`
- generates a local Claude MCP snippet at `~/.config/tiware/bobthetester/claude-mcp-server.local.json`
- prints next steps for Claude setup

Optional: auto-merge directly into Claude Desktop config:

```bash
./scripts/setup-bobthetester.sh --write-desktop-config
```

Alternative from package folder:

```bash
npm --prefix tools/regression-mcp run setup:bobthetester
```

## 2) Configure MCP in Claude (manual alternative)
If you prefer manual config, use generated snippet or the template at `config/regression/claude-mcp-server.example.json`.

Example entry:
```json
{
  "mcpServers": {
    "tiware-regression": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/BobTheTester/tools/regression-mcp/dist/index.js"
      ]
    }
  }
}
```

## 3) Use `/bobthetester`
The custom slash command is in `.claude/commands/bobthetester.md`.

Examples:
- `/bobthetester`
- `/bobthetester {"changedFiles":["src/features/user-onboarding/step.ts"],"dryRun":false,"browser":"electron"}`

Behavior:
- loads conceptual policy with `read_business_review_policy`
- runs deterministic one-shot pipeline with `generate_regression_review` (mapping, suite generation, suite validation, targeted Cypress execution)
- runs deterministic `generate_code_review_report` on the same change scope
- skips Cypress execution when no impacted specs are selected (no implicit full-suite fallback)
- asks targeted questions only if required context is missing

To force a suite refresh before review:

```bash
npm --prefix tools/regression-mcp run suite -- '{}'
```

## 4) What you get
Structured output with:
- mapping details (`fileToFlows`, `unmappedFiles`)
- impacted flows
- suite generation summary
- selected Cypress specs
- pass/fail summary
- failed tests
- artifact paths
- missing tests suggestions
- risk level and actions

Code-review output includes:
- changed files and diff summary
- sensitive-path and added-line findings
- severity counters
- risk level and recommended actions
