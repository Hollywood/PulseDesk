---
name: demo-reset
description: Reset Ticketdroid to the interview start state. Use when preparing a live demo or after a run.
---

# Demo Reset

## Instructions
1. Run the demo reset (web "Reset demo" button, `POST /api/demo/reset`, or the
   claims-api `resetDemo` function).
2. Confirm `pnpm test` in `claims-api` fails on the duplicate-claim case
   (expected_red baseline) and nothing else.
3. Restore fixtures if modified.
4. Print the exact click path: open web → pick any ticket → Run Ticketdroid.

## How reset works (git-based)
Since the repo has commits, every run happens on a disposable local branch and
never touches `main`, so reset is purely git plumbing:

- `git switch --force main` (discards any uncommitted run edits on the demo
  branch; safe because a run may only start from a clean tree)
- Delete every `ticketdroid/*` demo branch
- Remove run-created files by difference against the pre-run manifest under
  `claims-api/artifacts/runs/*.untracked-before.json`, covering untracked AND
  gitignored files (e.g. a fresh service's `node_modules`). Cleanup only runs
  when a full, non-legacy manifest exists, so pre-existing user files and
  ignored tooling directories (root `node_modules`, `dist`, `artifacts`) are
  never touched.
- Clear `claims-api/artifacts/runs/` (run artifacts and manifests)
- Verify `claims-api/src/domain/active-strategy.ts` is back to the planted
  buggy binding; refuse with `reset_verification_failed` otherwise

Run artifacts live under `claims-api/artifacts/runs/` (gitignored). The
deterministic orchestrator's baseline snapshots are still cleaned there.

## Confirm the red baseline
- `pnpm test` in `claims-api` fails on exactly the duplicate-claim case
  (`logical_submission_count expected 1, actual 2`).
- Click path: open web (`pnpm dev` in `claims-api` and `web`) → any ticket →
  Run Ticketdroid → wait for the Factory droid session → PR view.
