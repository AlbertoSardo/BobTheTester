# BobTheTester

Workflow MCP deterministico per fare regression review su flow di business con Playwright, integrato in Claude tramite comando `/bobthetester`.

Aggiornamento corrente: migrazione clean-cut completata su Playwright con output unificato (`generate_unified_review`) e quality gates deterministici.

## Cosa fa
- Mappa i file cambiati su flow di business (`onboarding`, `offboarding`, `profile`, `permissions`)
- Seleziona in modo deterministico le spec Playwright rilevanti
- Genera/aggiorna scaffold scenario-based nelle spec Playwright da business policy
- Genera domande di chiarimento mirate quando la policy non basta per test realmente eseguibili
- Esegue regression test con output machine-readable
- Raccoglie report e artifact
- Evidenzia gap di copertura (flow senza spec o file non mappati)
- Esegue code review deterministica con finding strutturati per severita
- Produce un output finale strutturato con rischio (`low` -> `critical`)

## Principi del progetto
- Tool MCP deterministici, senza ragionamento nascosto nel layer tool
- Logica di business esplicita in JSON versionato
- Orchestrazione agentica separata dal layer di esecuzione
- Playwright come execution engine per regression UI

## Prerequisiti
- Node.js e npm disponibili in PATH
- Git
- GitHub CLI (`gh`) opzionale, utile per operazioni repo/PR
- Claude con supporto MCP e comandi repository (per usare `/bobthetester`)

## Installazione rapida (da GitHub)
Dal root del repo:

```bash
git clone <URL-REPO>
cd BobTheTester
./scripts/setup-bobthetester.sh
```

Questo script:
1. installa dipendenze in `tools/regression-mcp`
2. installa runtime browser Playwright (`chromium`)
3. builda il server MCP
4. genera snippet config MCP locale in:
   - `~/.config/tiware/bobthetester/claude-mcp-server.local.json`

Per aggiornare automaticamente la config di Claude Desktop:

```bash
./scripts/setup-bobthetester.sh --write-desktop-config
```

Opzioni utili:
- `--skip-install`
- `--skip-build`
- `--desktop-config-path <path>`

## Configurazione MCP in Claude (manuale)
Se non usi il merge automatico, aggiungi server MCP nella tua config Claude.

Template di riferimento: `config/regression/claude-mcp-server.example.json`

Esempio:

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

## Uso consigliato: `/bobthetester`
Il comando custom e in `.claude/commands/bobthetester.md`.

Esempi:

```text
/bobthetester
/bobthetester {"changedFiles":["src/features/user-onboarding/step.ts"],"dryRun":false,"browser":"chromium"}
```

Comportamento atteso:
1. legge policy business (`read_business_review_policy`)
2. esegue review unificata (`generate_unified_review`) sullo stesso scope di modifica.
3. nel blocco regression della review unificata esegue:
   - mapping file -> flow,
   - generazione/aggiornamento suite sui flow impattati,
   - normalizzazione marker scenario (`[scenario-id:...]`, `[status:scaffold|implemented]`),
   - validazione completezza,
   - run Playwright locale sulle sole spec selezionate,
   - output finale comprensivo con rischio e azioni.
4. nel blocco code-review della review unificata applica regole deterministiche su path sensibili, added lines e dimensione diff.
5. se non ci sono spec impattate, salta Playwright (no full suite implicita) e riporta gap/risk.
6. se mancano dettagli policy esecutivi, include `clarificationQuestions` per follow-up proattivo.
7. calcola `overallRiskLevel` e quality gates in un output unico.
8. non esegue auto-merge: fornisce evidenze e rischio per supportare la decisione umana di merge.

Nota quality-gate: con policy `scaffold-first`, gli scenari con `[status:scaffold]` su flow impattati bloccano il gate regression finche non vengono implementati.

## Flusso end-to-end (come funziona)

```mermaid
flowchart TD
  A["1) Avvio /bobthetester"] --> B["2) Legge policy business"]
  B --> C["3) Esegue generate_unified_review"]

  C --> D["4) Regression subflow"]
  C --> E["5) Code review subflow"]

  D --> F{"Spec Playwright selezionate?"}
  F -- "si" --> G["6) Run Playwright + report + artifact"]
  F -- "no" --> H["6) Salta Playwright in modo sicuro"]
  G --> I["7) Calcola riskLevel regression"]
  H --> I

  E --> J["8) Calcola riskLevel code review"]
  I --> K["9) Calcola overallRiskLevel"]
  J --> K
  K --> L["10) Output finale per decisione umana (no auto-merge)"]
```

Spiegazione semplice degli step:
1. Avvii `/bobthetester` con file cambiati o con `baseRef/headRef`.
2. L'agente carica la policy business per sapere cosa controllare.
3. Parte un tool unico (`generate_unified_review`) che coordina tutti i check.
4. Il blocco regression fa mapping flow, suite/check e selezione spec.
5. In parallelo gira la code review deterministica sullo stesso scope.
6. Se ci sono spec, esegue Playwright; se non ci sono, lo salta senza full suite implicita.
7. Calcola il rischio regression dai risultati test/copertura.
8. Calcola il rischio code review dai finding deterministici.
9. Combina i due rischi in `overallRiskLevel`.
10. Restituisce un report unico per aiutare la decisione umana di merge.

## Esecuzione manuale (senza slash command)
Dal root del repo:

```bash
npm --prefix tools/regression-mcp install
npm --prefix tools/regression-mcp exec playwright install chromium
npm --prefix tools/regression-mcp run build
```

1) Genera o aggiorna suite da policy:

```bash
npm --prefix tools/regression-mcp run suite -- '{}'
```

2) Valida copertura suite:

```bash
npm --prefix tools/regression-mcp run suite:check -- '{}'
```

3) Esegui review completa su changed files espliciti:

```bash
npm --prefix tools/regression-mcp run review -- '{"changedFiles":["src/features/user-onboarding/step.ts"],"dryRun":false,"browser":"chromium"}'
```

4) Oppure modalita git-diff driven:

```bash
npm --prefix tools/regression-mcp run review -- '{"baseRef":"origin/main","headRef":"HEAD","includeUntracked":true,"dryRun":false}'
```

5) Review unificata (regression + code-review) in un unico output:

```bash
npm --prefix tools/regression-mcp run unified-review -- '{"baseRef":"origin/main","headRef":"HEAD","includeUntracked":false,"dryRun":false}'
```

6) (Opzionale) solo gate code review via CLI:

```bash
npm --prefix tools/regression-mcp run code-review -- '{"baseRef":"origin/main","headRef":"HEAD","includeUntracked":false}'
```

## Tool MCP disponibili
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

## Config principali da conoscere
- `config/regression/flow-map.json` -> changed files -> flow
- `config/regression/flow-spec-map.json` -> flow -> spec Playwright
- `config/regression/business-review-policy.json` -> criteri business e copertura minima
  - campi opzionali consigliati per portabilita cross-project:
    - `playwrightContext.baseUrl`
    - `playwrightContext.authStrategy`
    - `flows.<flowId>.executionHints.entryPath`
    - `flows.<flowId>.executionHints.primaryActor`
  - valori placeholder (`<set-...>`, `TODO`, `TBD`) vengono trattati come non chiari e generano `clarificationQuestions`
- `config/regression/tooling.json` -> configurazione esecuzione/report/artifact
- `config/regression/review-output.schema.json` -> schema output finale
- `config/regression/code-review-policy.json` -> regole deterministiche code review
- `config/regression/code-review-output.schema.json` -> schema output code review
- `config/regression/unified-review-output.schema.json` -> schema output unificato

Mappa leggibile per reviewer:
- `docs/flows/test-mapping.json`

## Output e artifact
- Report JSON Playwright: `artifacts/playwright/results.json`
- Video/screenshot/trace: `test-results/`
- HTML report (se abilitato): `playwright-report/`

L'output review include almeno:
- `mapping`
- `impactedFlows`
- `suiteGeneration`
- `suiteCompleteness`
- `selectedSpecs`
- `passFailSummary`
- `failedTests`
- `artifactPaths`
- `suggestedMissingTests`
- `clarificationQuestions`
- `riskLevel`

L'output code review include almeno:
- `summary`
- `findings`
- `findingCounts`
- `riskLevel`
- `recommendedActions`

L'output unificato include almeno:
- `regressionReview`
- `codeReview`
- `overallRiskLevel`
- `overallRecommendedActions`
- `qualityGates`

Per marcare uno scenario come implementato:
1. sostituisci i placeholder del test con step/assertion Playwright reali
2. aggiorna il titolo da `[status:scaffold]` a `[status:implemented]`
3. riesegui `suite:check` e `unified-review`

## Come mantenere il sistema aggiornato
Quando aggiungi/modifichi flow di business:
1. aggiorna `config/regression/business-review-policy.json`
2. aggiorna `config/regression/flow-map.json`
3. aggiorna `config/regression/flow-spec-map.json`
4. sincronizza `docs/flows/test-mapping.json`
5. rigenera e valida suite:

```bash
npm --prefix tools/regression-mcp run suite -- '{}'
npm --prefix tools/regression-mcp run suite:check -- '{}'
```

## Troubleshooting rapido
- `/bobthetester` non trovato: verifica che il client Claude carichi `.claude/commands/`
- MCP non parte: verifica che esista `tools/regression-mcp/dist/index.js` (build mancante)
- Nessun test eseguito: controlla `dryRun` (se `true`, esecuzione reale viene saltata)
- Nessuna spec selezionata: Playwright viene saltato per sicurezza; controlla mapping in `flow-map.json` e `flow-spec-map.json`
- Gate regression fallito con test verdi: controlla scenari ancora `[status:scaffold]` nei flow impattati
- Gate regression alto anche con flow implementati: controlla `clarificationQuestions` bloccanti (policy incompleta)

## Documentazione di dettaglio
- `docs/ai/bobthetester-quickstart.md`
- `docs/ai/regression-mcp-usage.md`
- `docs/ai/regression-mcp-plan.md`
- `docs/ai/regression-mcp-status.md`
