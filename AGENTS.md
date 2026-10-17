# PulseDesk

## What this project is

PulseDesk is a demonstration ticket inbox for a regional multi-facility health
system. It presents synthetic operational alerts, runs a deterministic local
root-cause and regression workflow, and produces a reviewable patch summary.
Human review is required before any change is merged or deployed.

The primary demo path is `TICKET-1042`, a duplicate insurance claim submission
on retry. This is a revenue-cycle/billing scenario, not a clinical or
patient-safety scenario. Do not introduce clinical data or patient-care cases.

## Commands

- Install: `pnpm install` at the repository root
- Run API: `pnpm dev` in `claims-api/`
- Run web: `pnpm dev` in `web/`
- Certify the primary planted regression: `pnpm --dir claims-api gate`
- Test the web app: `pnpm --dir web test`
- Test scheduling: `pnpm --dir scheduling-api test`
- Type-check all workspaces: `pnpm -r typecheck`

## Project layout

- `web/` — ticket inbox, run timeline, and patch review view
- `claims-api/` — sample claims-submission service and ticket API
- `claims-status-api/` — secondary sample service used by ticket fixtures
- `scheduling-api/` — secondary sample service used by ticket fixtures
- `fixtures/` — synthetic ticket data; no live credentials or real patient data

## Conventions

- Use TypeScript and keep modules small.
- Keep HTTP handlers thin and business logic independently testable.
- The planted regression must remain reproducible before the patch and green
  after the patch.
- Automated runs operate on a local `pulsedesk/<TICKET-ID>` branch. They never
  push, merge, or deploy.
- All patient and claim identifiers are synthetic. Never add names, medical
  record numbers, dates of birth, diagnoses, or other PHI-shaped data.

## Verification

Before completing a change:

1. Run `pnpm --dir claims-api gate`; the baseline must certify the one expected
   `TICKET-1042` failure rather than treating it as an unexplained test failure.
2. Run `pnpm --dir web test` and `pnpm --dir scheduling-api test`.
3. Run `pnpm -r typecheck`.
4. Confirm the API health endpoint returns `{ "status": "ok" }`.
5. Confirm the web inbox loads the fixture tickets.

Do not use `pnpm -r test` as the baseline gate. The repository intentionally
contains red regression fixtures for unresolved sample tickets.

## Safety

- Do not add real secrets, incident-management tokens, or production URLs.
- Do not add real billing, payer, or clinical integrations.
- Do not silently merge, push, or deploy generated patches.
- Preserve human approval as the boundary between analysis and delivery.
