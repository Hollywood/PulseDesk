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
- One fully wired ticket: TICKET-1042. Other tickets may be fixtures only.
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
1. `pnpm test` in `claims-api`
2. Click TICKET-1042 → Run → PR view shows a real diff
3. Demo reset returns the repo to the pre-patch state

## Safety
- Do not add real secrets, PagerDuty tokens, or production URLs.
- Do not implement login, real billing/claims-payer integration, or multi-tenancy.
- Do not use or generate anything that looks like real PHI (patient names,
  MRNs, diagnoses, DOBs). Fixtures are synthetic IDs only.
- Do not expand scope past the TICKET-1042 happy path until that path works twice.
- Human review is required to apply/merge the patch. No silent merge, no auto-deploy.
