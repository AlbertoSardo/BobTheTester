# BobTheTester

Automated regression review and policy coverage analysis for PRs, powered by MCP tools and Playwright.

Give it your business policy, it analyzes your PR, generates missing Playwright tests, runs them, and tells you what's covered and what's not.

## How it works

```mermaid
flowchart TD
    A["Your PR"] --> B["BobTheTester"]
    B --> C["Detect impacted\nbusiness flows"]
    C --> D["Generate + run\nPlaywright tests"]
    D --> E["Coverage report\n+ quality gates"]
    E -->|gaps found| F["Ask questions\n+ re-run"]
    F --> D
```

## Quick start

```bash
git clone <REPO-URL> && cd BobTheTester
./scripts/setup-bobthetester.sh
```

Then in Claude or OpenCode:

```
/bobthetester config/regression/business-review-policy.json
```

That's it. BobTheTester reads the policy, analyzes your changes, generates tests, runs them, and outputs a report.

## Input formats

The command accepts anything:

```text
/bobthetester                                          # uses default policy
/bobthetester config/regression/business-review-policy.json   # JSON policy file
/bobthetester docs/requirements.pdf                    # PDF, Markdown, any format
/bobthetester The registration flow must validate email and persist the user...  # free text
```

Non-JSON input is automatically converted to a structured policy before running.

## MCP setup

### Claude Desktop

```bash
./scripts/setup-bobthetester.sh --write-desktop-config
```

Or manually in your Claude MCP config:

```json
{
  "mcpServers": {
    "tiware-regression": {
      "command": "node",
      "args": ["/absolute/path/to/BobTheTester/tools/regression-mcp/dist/index.js"]
    }
  }
}
```

### OpenCode

```bash
./scripts/setup-bobthetester.sh --write-opencode-config
```

Or manually in `opencode.jsonc`:

```jsonc
{
  "mcp": {
    "bobthetester": {
      "type": "local",
      "command": ["node", "/absolute/path/to/BobTheTester/tools/regression-mcp/dist/index.js"],
      "enabled": true
    }
  }
}
```

The same command file is shared via symlink — works identically in both clients.

## What it produces

- **Terminal report**: summary, policy coverage per flow, test results, quality gates, recommended actions
- **HTML dashboard** (`artifacts/report.html`): interactive treemap + radar charts with D3.js
- **Generated Playwright specs**: scaffold tests for uncovered business flows

### Quality gates

| Gate | Passes when |
|------|-------------|
| Suite completeness | All impacted flows have implemented (non-scaffold) tests |
| Policy coverage | Coverage score >= 70% |
| Regression risk | Risk level is `low` or `medium` |

### Policy coverage scoring

| Dimension | Weight | What it measures |
|-----------|--------|-----------------|
| Regression scenarios | 50% | Implemented vs required test scenarios |
| Must-hold invariants | 30% | Business invariants covered by tests |
| Branch coverage | 20% | V8 branch coverage from Playwright |

## CLI usage (without Claude)

```bash
npm run build
npm run unified-review -- '{"baseRef":"origin/main","dryRun":false}'
npm run suite           # generate specs from policy
npm run suite:check     # validate completeness
```

## Configuration

| File | Purpose |
|------|---------|
| `config/regression/business-review-policy.json` | Business flows, invariants, required coverage |
| `config/regression/flow-map.json` | Source file patterns → business flow mapping |
| `config/regression/flow-spec-map.json` | Business flow → Playwright spec mapping |
| `config/regression/tooling.json` | Git refs, Playwright config, report paths |

## In-depth overview

```mermaid
flowchart TD
    A["/bobthetester"] --> B["Read business policy"]
    B --> C["Detect changed files via git diff"]
    C --> D["Map files to impacted business flows"]

    D --> E["Regression path"]
    D --> F["Policy coverage path"]

    E --> G["Generate missing Playwright specs"]
    G --> H{"Specs to run?"}
    H -- Yes --> I["Run Playwright\n+ collect coverage"]
    H -- No --> J["Skip safely"]
    I --> K["Parse report & collect artifacts"]
    J --> K

    F --> L["Evaluate policy coverage\n(must-hold, scenarios, branches)"]

    K --> M["Evaluate quality gates"]
    L --> M

    M --> N{"Policy covered?"}
    N -- No --> Q["Flag uncovered invariants\n+ raise risk level"]
    N -- Yes --> R{"Policy gaps\n(blocking questions)?"}
    Q --> R
    R -- Yes --> O["Ask clarifying questions\n(max 3 rounds)"]
    O --> U["Update policy with answers"]
    U --> G
    R -- No --> S["Generate HTML dashboard"]
    S --> P["Output terminal report\nrisk level + recommended actions"]

    style A fill:#4f46e5,color:#fff
    style P fill:#16a34a,color:#fff
    style O fill:#f59e0b,color:#000
    style Q fill:#dc2626,color:#fff
    style S fill:#7c3aed,color:#fff
    style U fill:#0ea5e9,color:#fff
```

## Sandbox

Try BobTheTester on a real app: **[Sandbox-BobTheTester](https://github.com/AlbertoSardo/Sandbox-BobTheTester)** — a clinic management app with 3 business flows and step-by-step test scenarios.

## Docs

- [Quick start](docs/ai/bobthetester-quickstart.md)
- [Usage guide](docs/ai/regression-mcp-usage.md)
- [Architecture](docs/ai/regression-mcp-plan.md)
- [Status](docs/ai/regression-mcp-status.md)
