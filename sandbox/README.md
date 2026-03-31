# BobTheTester Sandbox

Questa sandbox ti permette di provare BobTheTester end-to-end su un'app reale, con scenari di PR realistici, in pochi minuti.

## Cosa c'e' dentro

Una web app per la gestione di una clinica medica (Express + SQLite in-memory) con 3 business flow:

- **patient-registration** — Registrare nuovi pazienti con validazione form
- **appointment-booking** — Prenotare appuntamenti con prevenzione double-booking
- **doctor-assignment** — Assegnare dottori ai pazienti, gestire disponibilita'

L'app gira su `http://localhost:3333`. I dati vivono solo in memoria — ogni riavvio riparte pulito.

### Coverage di partenza

| Flow | Test implementati | Test scaffold | Note |
|------|:-:|:-:|------|
| patient-registration | 1 | 2 | Happy path coperto |
| appointment-booking | 1 | 2 | Happy path coperto |
| doctor-assignment | 0 | 3 | Tutto scaffold — volutamente scoperto |

Questo simula un progetto reale dove alcune aree sono ben coperte e altre no.

---

## Prerequisiti

- Node.js >= 18
- npm
- Git
- Claude con supporto MCP (per usare `/bobthetester`)

---

## Setup (una volta sola)

Dalla root del repo (`BobTheTester/`):

```bash
# 1. Installa e builda BobTheTester
npm install --prefix tools/regression-mcp
npm run build

# 2. Installa le dipendenze della clinic app
npm install --prefix sandbox/clinic-app
```

Fatto. Tutto il resto e' automatico.

### Verifica rapida (opzionale)

```bash
# Verifica che l'app si avvii
npx tsx sandbox/clinic-app/src/app.ts
# Apri http://localhost:3333 nel browser — dovresti vedere la clinica
# Ctrl+C per fermarla

# Verifica che i test Playwright passino
NODE_PATH=$(pwd)/tools/regression-mcp/node_modules \
  npm exec --prefix tools/regression-mcp -- \
  playwright test --config sandbox/playwright.config.ts --project chromium
# Output atteso: 9 passed
```

---

## Come provare BobTheTester

### Prova 1 — Baseline (stato attuale, nessuna modifica)

Apri Claude e lancia:

```
/bobthetester sandbox/config/regression/business-review-policy.json
```

**Cosa aspettarsi:**
- BobTheTester rileva i file cambiati dall'ultimo commit
- Mappa i file ai 3 business flow
- Mostra che `doctor-assignment` ha 0% di coverage implementata
- Il quality gate FALLISCE (troppi test scaffold)
- Viene generato un report HTML in `sandbox/artifacts/report.html` — aprilo nel browser per vedere treemap e radar chart

### Prova 2 — Story A: Aggiungere campo email alla registrazione paziente

Questa prova simula una PR che aggiunge un campo email al form di registrazione.

```bash
# 1. Crea un branch
git checkout -b feature/patient-email
```

Ora modifica `sandbox/clinic-app/src/patients/routes.ts`. Aggiungi:
- Un campo `email?: string` all'interfaccia `Patient`
- Un input email al form di registrazione (dopo il telefono)
- Validazione: se l'email e' presente, deve contenere `@`
- Salvataggio dell'email nel database
- Visualizzazione dell'email nella pagina dettaglio paziente

Poi lancia BobTheTester:

```
/bobthetester sandbox/config/regression/business-review-policy.json
```

**Cosa aspettarsi:**
- Solo il flow `patient-registration` risulta impattato
- I flow `appointment-booking` e `doctor-assignment` NON vengono toccati
- BobTheTester segnala che i test scaffold devono essere implementati
- La policy coverage di `patient-registration` e' parziale
- Le recommended actions suggeriscono di aggiornare i test per coprire la validazione email

Per tornare allo stato iniziale: `git checkout main`

### Prova 3 — Story B: Cancellazione appuntamenti

Questa prova simula una PR che aggiunge la possibilita' di cancellare un appuntamento.

```bash
# 1. Crea un branch
git checkout -b feature/cancel-appointment
```

Modifica `sandbox/clinic-app/src/appointments/routes.ts`. Aggiungi:
- Una route POST `/:id/cancel` che cambia lo status a `"cancelled"`
- Un bottone "Cancel" nella lista appuntamenti (solo per quelli con status `"scheduled"`)

Poi lancia BobTheTester:

```
/bobthetester sandbox/config/regression/business-review-policy.json
```

**Cosa aspettarsi:**
- Solo il flow `appointment-booking` risulta impattato
- BobTheTester segnala che la cancellazione non e' tra gli scenari coperti dalla policy
- I test scaffold vengono flaggati per l'implementazione
- Le recommended actions suggeriscono di aggiungere test per la cancellazione

Per tornare allo stato iniziale: `git checkout main`

### Prova 4 — Input da testo libero (ticket Jira)

Invece di passare un file di policy, incolla direttamente il testo di un ticket:

```
/bobthetester Il flusso di registrazione paziente deve ora raccogliere il codice fiscale del paziente. Il campo e' obbligatorio. Il codice fiscale deve essere validato nel formato italiano (16 caratteri alfanumerici). Il dato deve persistere e essere visibile nella pagina dettaglio paziente.
```

**Cosa aspettarsi:**
- BobTheTester estrae i business flow dal testo
- Genera un `business-review-policy.json` con i requisiti del codice fiscale
- Mostra un riepilogo di cosa ha estratto (flow, scenari, placeholder)
- Procede automaticamente con la review

---

## Valutazione

Dopo ogni prova, valuta BobTheTester su questi aspetti:

| Aspetto | Domanda |
|---------|---------|
| **Accuratezza** | Ha identificato correttamente i flow impattati? Ne ha perso qualcuno? Ha generato falsi positivi? |
| **Coverage** | I punteggi sono ragionevoli? Le 3 dimensioni (must-hold, scenari, branch) hanno senso? |
| **Generazione test** | I test scaffold generati sono sensati? Sono nel file spec giusto? |
| **Report terminale** | E' chiaro e scansionabile? Le azioni raccomandate sono utili e concrete? |
| **Dashboard HTML** | Treemap e radar riflettono i dati reali? Il drill-down funziona? |
| **Domande di chiarimento** | Sono mirate? Aiutano davvero a completare la policy? |
| **Conversione input** | Se hai usato PDF/testo, i flow estratti hanno senso? |

---

## Reset

Per tornare allo stato iniziale e riprovare:

```bash
git checkout main
git clean -fd sandbox/artifacts sandbox/test-results
```
