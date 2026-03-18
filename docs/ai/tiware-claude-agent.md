# TIware Claude Agent (MCP) - Skeleton

Questo file definisce lo scheletro del "plugin" per Claude usando il server MCP di questa repo.

## 1) Avvio MCP server
Build e avvio:

```bash
npm --prefix tools/regression-mcp install
npm --prefix tools/regression-mcp run build
npm --prefix tools/regression-mcp run start
```

Setup automatico consigliato (install + build + snippet MCP):

```bash
./scripts/setup-bobthetester.sh
```

## 2) Collegare il server a Claude Desktop
Config MCP (esempio, percorso assoluto da adattare):

- Template pronto: `config/regression/claude-mcp-server.example.json`
- Snippet locale generato automaticamente: `~/.config/tiware/bobthetester/claude-mcp-server.local.json`

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

## 3) Invocazione consigliata in Claude
Prompt master da usare in chat con Claude:

```text
Agisci come TIware Regression Agent.
Obiettivo: review tecnica + concettuale (business flow) con non-regression mirata.

Regole:
- Prima di analizzare i risultati, usa `read_business_review_policy` per caricare i criteri concettuali.
- Usa il tool MCP `generate_unified_review` come entrypoint one-shot (include regression + code-review sullo stesso scope).
- Se non ci sono spec impattate, mantieni `runnerStatus: skipped` (nessun fallback implicito a full-suite).
- Se mancano dati essenziali, fai al massimo 3 domande mirate.
- Se non sei bloccato, non fare domande e procedi.
- Mantieni le conclusioni deterministiche e collegate all'output dei tool.

Output richiesto:
1) Technical findings
2) Product/flow findings (onboarding/offboarding/profile/permissions)
3) Business policy checks (pass/fail per criterio rilevante)
4) Regressioni trovate
5) Missing tests / gap mapping
6) Risk level e motivazione
7) Azioni consigliate prioritarizzate
```

## 4) Contratto orchestration
Config ispezionabile dell'orchestrazione multi-ruolo:

- `config/regression/tiware-agent-orchestration.json`

Policy concettuale business versionata:

- `config/regression/business-review-policy.json`

Output strutturato richiesto:

- `config/regression/unified-review-output.schema.json`
- `config/regression/review-output.schema.json`
- `config/regression/code-review-output.schema.json`

## 5) Multi-agent logico (in Claude)
Il comportamento multi-agent viene orchestrato nel prompt (non nel layer tool):

- `technical-reviewer`: qualità tecnica e rischio implementativo
- `product-flow-reviewer`: impatto sui flussi utente/business
- `regression-runner`: selezione/esecuzione test Playwright mirati
- `synthesizer`: sintesi finale con priorità e azioni

## 6) Fallback locale senza client MCP
Se vuoi testare subito il comportamento senza integrare Claude Desktop:

```bash
npm --prefix tools/regression-mcp run tool -- read_business_review_policy '{}'
npm --prefix tools/regression-mcp run review -- '{"changedFiles":["src/features/user-onboarding/step.ts"],"dryRun":false,"browser":"chromium"}'
```

Questo produce lo stesso output strutturato che Claude dovrebbe usare come base oggettiva.

## 7) Slash command pronto
Il comando custom e` versionato in repo:

- `.claude/commands/bobthetester.md`

Uso:

```text
/bobthetester
/bobthetester {"changedFiles":["src/features/user-onboarding/step.ts"],"dryRun":false,"browser":"chromium"}
```

Il comando e` progettato per:
1. caricare policy concettuale;
2. eseguire review unificata one-shot (`generate_unified_review`) con suite generation/validation incluse;
3. includere anche il gate code review deterministico nello stesso output;
4. evitare run full-suite impliciti quando non ci sono spec selezionate;
5. fare domande solo se mancano dati bloccanti.

Quickstart end-to-end da GitHub:

- `docs/ai/bobthetester-quickstart.md`
