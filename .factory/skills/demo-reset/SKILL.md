---
name: demo-reset
description: Reset Ticketdroid to the interview start state. Use when preparing a live demo or after a run.
---

# Demo Reset

## Instructions
1. Restore `claims-api` to the planted-bug commit or stash the patch.
2. Confirm `pnpm test` in `claims-api` fails on the duplicate-claim case.
3. Restore fixtures if modified.
4. Print the exact click path: open web → TICKET-1042 → Run.

## Concrete steps (pre-git baseline)
Until the repo has commits, each Ticketdroid run persists everything reset
needs under `claims-api/artifacts/runs/`:
- Restore the planted bug:
  `cp claims-api/artifacts/runs/TICKET-1042.active-strategy.baseline.ts claims-api/src/domain/active-strategy.ts`
- Remove the recorded run so the app returns to the pre-run state:
  `rm claims-api/artifacts/runs/TICKET-1042.json claims-api/artifacts/runs/TICKET-1042.active-strategy.baseline.ts`
- Confirm `pnpm test` in `claims-api` fails on exactly the duplicate-claim case.
- Click path: open web (`pnpm dev` in `claims-api` and `web`) → TICKET-1042 → Run Ticketdroid.
