# BobTheTester Sandbox

This sandbox lets you try BobTheTester end-to-end on a real app, with realistic PR scenarios, in just a few minutes.

## What's inside

A clinic management web app (Express + in-memory SQLite) with 3 business flows:

- **patient-registration** — Register new patients with form validation
- **appointment-booking** — Book appointments with double-booking prevention
- **doctor-assignment** — Assign doctors to patients, manage availability

The app runs on `http://localhost:3333`. Data lives in memory only — every restart starts clean.

### Starting coverage

| Flow | Implemented tests | Scaffold tests | Notes |
|------|:-:|:-:|------|
| patient-registration | 1 | 2 | Happy path covered |
| appointment-booking | 1 | 2 | Happy path covered |
| doctor-assignment | 0 | 3 | All scaffold — intentionally uncovered |

This simulates a real project where some areas are well covered and others are not.

---

## Prerequisites

- Node.js >= 18
- npm
- Git
- Claude with MCP support (to use `/bobthetester`)

---

## Setup (one time only)

From the repo root (`BobTheTester/`):

```bash
# 1. Install and build BobTheTester
npm install --prefix tools/regression-mcp
npm run build

# 2. Install clinic app dependencies
npm install --prefix sandbox/clinic-app
```

Done. Everything else is automatic.

### Quick verification (optional)

```bash
# Verify the app starts
npx tsx sandbox/clinic-app/src/app.ts
# Open http://localhost:3333 in your browser — you should see the clinic app
# Ctrl+C to stop

# Verify Playwright tests pass
NODE_PATH=$(pwd)/tools/regression-mcp/node_modules \
  npm exec --prefix tools/regression-mcp -- \
  playwright test --config sandbox/playwright.config.ts --project chromium
# Expected output: 9 passed
```

---

## How to test BobTheTester

### Test 1 — Baseline (current state, no changes)

Open Claude and run:

```
/bobthetester sandbox/config/regression/business-review-policy.json
```

**What to expect:**
- BobTheTester detects files changed since the last commit
- Maps files to the 3 business flows
- Shows that `doctor-assignment` has 0% implemented coverage
- The quality gate FAILS (too many scaffold tests)
- An HTML report is generated at `sandbox/artifacts/report.html` — open it in your browser to see the treemap and radar charts

### Test 2 — Story A: Add email field to patient registration

This test simulates a PR that adds an email field to the registration form.

```bash
# 1. Create a branch
git checkout -b feature/patient-email
```

Now edit `sandbox/clinic-app/src/patients/routes.ts`. Add:
- An `email?: string` field to the `Patient` interface
- An email input field to the registration form (after phone)
- Validation: if email is provided, it must contain `@`
- Save the email in the INSERT statement
- Display the email on the patient detail page

Then run BobTheTester:

```
/bobthetester sandbox/config/regression/business-review-policy.json
```

**What to expect:**
- Only the `patient-registration` flow is impacted
- The `appointment-booking` and `doctor-assignment` flows are NOT touched
- BobTheTester flags that scaffold tests need implementation
- Policy coverage for `patient-registration` is partial
- Recommended actions suggest updating tests to cover email validation

To reset: `git checkout main`

### Test 3 — Story B: Appointment cancellation

This test simulates a PR that adds the ability to cancel an appointment.

```bash
# 1. Create a branch
git checkout -b feature/cancel-appointment
```

Edit `sandbox/clinic-app/src/appointments/routes.ts`. Add:
- A POST route `/:id/cancel` that changes the appointment status to `"cancelled"`
- A "Cancel" button in the appointment list (only for appointments with status `"scheduled"`)

Then run BobTheTester:

```
/bobthetester sandbox/config/regression/business-review-policy.json
```

**What to expect:**
- Only the `appointment-booking` flow is impacted
- BobTheTester flags that cancellation is not among the scenarios covered by the policy
- Scaffold tests are flagged for implementation
- Recommended actions suggest adding tests for the cancellation flow

To reset: `git checkout main`

### Test 4 — Free-form text input (Jira ticket)

Instead of passing a policy file, paste ticket content directly:

```
/bobthetester The patient registration flow must now capture the patient's tax ID number. The field is mandatory. The tax ID must be validated as a 16-character alphanumeric string. The data must persist and be visible on the patient detail page.
```

**What to expect:**
- BobTheTester extracts business flows from the text
- Generates a `business-review-policy.json` with the tax ID requirements
- Shows a summary of what was extracted (flows, scenarios, placeholders)
- Proceeds automatically with the review

---

## Evaluation

After each test, evaluate BobTheTester on these criteria:

| Criteria | Question |
|----------|----------|
| **Accuracy** | Did it correctly identify impacted flows? Did it miss any? Did it generate false positives? |
| **Coverage** | Are the scores reasonable? Do the 3 dimensions (must-hold, scenarios, branches) make sense? |
| **Test generation** | Are the generated scaffold tests meaningful? Are they in the right spec file? |
| **Terminal report** | Is it clear and scannable? Are recommended actions useful and concrete? |
| **HTML dashboard** | Do the treemap and radar charts reflect the actual data? Does the drill-down work? |
| **Clarification questions** | Are they targeted? Do they actually help complete the policy? |
| **Input conversion** | If you used PDF/text, do the extracted flows make sense? |

---

## Reset

To return to the initial state and try again:

```bash
git checkout main
git clean -fd sandbox/artifacts sandbox/test-results
```
