# Ticketdroid

## What this project is
Customer-facing MVP for a regional multi-facility health system (hospital
network). Ticketdroid turns an incoming on-call ticket/signal (PagerDuty- or
Sentry-style, from the revenue cycle / claims platform) into an RCA, a
scoped patch, and a reviewable PR view. A human always approves before
anything merges — there is no auto-deploy in this MVP.
Demo path: TICKET-1042 (duplicate insurance claim submission on retry).
This is a revenue-cycle/billing bug, not a clinical or patient-safety one —
keep it that way; do not introduce clinical data or patient-care scenarios.

## Run path
Every fixture ticket has a working "Run Ticketdroid" button. Clicking it calls
back to Factory: claims-api starts a real droid session through the Droid
TypeScript SDK (`@factory/droid-sdk`), pointing at the repo root. The droid
processes the ticket, implements a fix (creating a missing service directory
when the ticket's service is not in the repo yet), and returns structured
evidence that claims-api records and the web PR view renders.
- No simulated fallback: if Factory is not reachable, the run surfaces a
  bounded error. Do not route runs through the deterministic local
  orchestration (`runTicket`) — it remains only as the planted-bug gate/CI
  validation, not the app's run path.
- Runs happen on a per-ticket local branch (`ticketdroid/<TICKET-ID>`); the
  droid commits its work there and claims-api computes the genuine git diff.
- Demo reset is git-based: it returns to `main`, deletes all
  `ticketdroid/*` branches, removes untracked files the run created, and
  clears `claims-api/artifacts/runs/`. It never deletes pre-existing user
  work (a dirty or untracked-dirty tree blocks a new run).

## Commands
- Install: `pnpm install` in `/web` and `/claims-api` (or repo-root workspace)
- Run API: `pnpm dev` in `/claims-api`
- Run web: `pnpm dev` in `/web`
- Test API: `pnpm test` in `/claims-api`
- Reset demo: follow `.factory/skills/demo-reset/SKILL.md`

## Project layout
- `web/` — ticket inbox, run timeline, PR view
- `claims-api/` — sample claims-submission service with one planted bug
- `fixtures/` — mocked PagerDuty/Sentry tickets; no live credentials, no real
  patient or claim data (synthetic only)
- `.factory/skills/` — reusable workflows for RCA, PR narrative, demo reset

## Conventions
- TypeScript where possible. Small modules. No auth. No cloud deploy.
- Every fixture ticket is wired: Run Ticketdroid calls back to Factory for a
  real droid run. TICKET-1042 carries the planted claims-api bug; the other
  tickets' services are created on demand by the droid during their runs.
- The planted bug must be real: tests fail before the patch and pass after.
- "Deploy" in this project means "open a reviewable PR," never "merge" or
  "push to a running environment." Do not implement auto-merge or auto-deploy.
- All patient/claim identifiers in fixtures are synthetic (e.g. `PT-0001`,
  `CLM-0001`). Never use real names, MRNs, or PHI-shaped data, even as a joke.

## Build approach
This is being built via a Mission (see MISSION_PROMPT.txt for the approved
goal and milestones). SESSION_PROMPTS.md is a superseded alternative plan
for building this milestone-by-milestone in regular sessions instead — not
in use, kept for reference only. Follow the Mission's approved milestones.
Do not expand scope beyond what was approved in the Mission plan.

## Verification
Before completing a milestone:
1. `pnpm test` in `claims-api` — the planted regression is red on a buggy
   workspace by design (expected_red); the rest of the suite passes.
2. Click any ticket → Run → a Factory droid session starts; when it completes
   the PR view shows a real diff.
3. Demo reset returns the repo to the pre-run state on `main`.

## Safety
- Do not add real secrets, PagerDuty tokens, or production URLs.
- Do not implement login, real billing/claims-payer integration, or multi-tenancy.
- Do not use or generate anything that looks like real PHI (patient names,
  MRNs, diagnoses, DOBs). Fixtures are synthetic IDs only.
- Do not expand scope past the TICKET-1042 happy path until that path works twice.
- Human review is required to apply/merge the patch. No silent merge, no auto-deploy.
