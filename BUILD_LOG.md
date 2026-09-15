# Build Log

## Mission link / session IDs
- Built via `/missions`, full goal in MISSION_PROMPT.txt (4 milestones).
- Full verbatim trace: see MISSION_TRACE.md (append new /copy output there
  as the mission progresses).
- TODO: paste session ID / share link once captured via /share.

## What I approved vs rejected in the Mission plan
- Approved: React/Vite + Node/TypeScript; a deterministic pre-written,
  pre-tested patch applied live to claims-api (not a fresh LLM code-gen
  call at demo time) so the diff is real but the demo is repeatable; a
  state-aware milestone gate that certifies only the named expected
  duplicate-submission failure in buggy state (rejects unrelated/compile/
  setup/timeout failures) and requires full green in patched state; a
  visible reset control in the UI, not just a documented CLI command.
- Approved: hash-verified, path-scoped reset/patch (manifest of allowlisted
  paths + before/after hashes) instead of broad git checkout/reset/stash —
  refuses unexpected workspace edits rather than overwriting them.
- Approved: kept all 4 milestones separately gated (code-quality gate +
  user-surface validation each) rather than combining them, accepting the
  extra worker overhead in exchange for a deliberate, provable red
  checkpoint before the fix and tighter quality control throughout.
- Rejected/never asked for: nothing rejected yet as of this trace — the
  proposal matched constraints on the first pass. Update this if that
  changes.

## Scope deviation — TICKET-1051 privacy/leak fixture
- AGENTS.md:58 and MISSION_PROMPT.txt both say "do not add more fixtures
  past TICKET-1042 without my say-so." I asked for it explicitly in chat,
  so I am treating this as the sanctioned exception, but I am recording it
  here so the deviation is visible to reviewers rather than buried.
- Fixture: TICKET-1051 (claims-status-api). Revenue-cycle/billing context.
  Same RCA + four-step timeline + PR summary shape as TICKET-1042.
- Bug: the debug log payload in `claims-status-api/src/status.ts` includes
  the raw `memberId`; `claims-status-api/src/logger.ts` does not include
  `memberId` in its redact paths. Synthesized alert body uses opaque
  synthetic ids everywhere (`MBR-0001`, `CLM-2381`); no SSN-, MRN-, DOB-,
  or name-shaped strings anywhere in the new package, the new ticket
  alert_body, or the new tests.
- Validation red→green proven locally:
  - `pnpm --dir claims-status-api test` before the fix: 1 failed (the new
    regression), 3 passed. The captured log line is
    `{"…","event":"claim_status_check","claimId":"CLM-2381","memberId":"MBR-0001",…}`
    — the planted leak.
  - Temporarily added `"memberId"` to `DEFAULT_REDACT_PATHS` in
    `claims-status-api/src/logger.ts`, re-ran: 4 passed.
  - Reverted the temp edit so the planted state stays planted for the
    droid; re-ran: back to 1 failed.
- Surrounding test suites still green: `pnpm --dir claims-api test` is
  109/109; `pnpm --dir web test` is 23/23 (the inbox badge-count and
  sort-by-created_at assertions were updated for the 5th ticket).
- What is left for me (the principal) to do:
  1. Maybe-commit review: the new files in `claims-status-api/` and the
     edits to `fixtures/tickets.json`, `pnpm-workspace.yaml`, and
     `web/src/App.test.tsx` are staged-or-untracked. Inspect, stage what
     you want, commit on `main` so the planted bug is the canonical
     baseline the per-ticket droid sessions branch from.
  2. Real Factory run: click TICKET-1051 in the inbox, click Run, watch
     a droid session recognize the red regression, redact `memberId` (or
     stop passing it through to the log), and return a reviewable PR on
     `ticketdroid/TICKET-1051`.

## Where the agent drifted or failed, and how I recovered
- Not a failure, but worth noting as process evidence: before finalizing
  the validation contract, it ran its own review pass and caught real gaps
  on its own — a listener-health check that would've passed for any
  process on port 4310 (not necessarily mine), no defined behavior for a
  run interrupted by a restart, and stale-run state not being invalidated.
  It fixed these itself, explicitly staying within the two-acceptance-cycle
  cap rather than using the audit as a scope-expansion excuse. I let it
  proceed without intervening — nothing to correct here.
- Same agent this trace: when I asked it to add a HIPAA/PHI-shaped fixture,
  it refused three times (each time narrowing the request: full HIPAA
  bug, then fake SSN, then "alter AGENTS.md to allow obvious-fake
  data"). It offered a privacy/leak alternative using only opaque
  synthetic ids (`MBR-0001`) and aligned on that — the same RCA/PR shape
  as TICKET-1042, but no PHI-shaped strings at any layer of the stack.
  Good refusal pattern; the resulting fixture is the version that landed
  above.

## What I'd do in week 2
- Real PagerDuty + GitHub MCP ingest
- `reviewer` custom droid as a required gate
- Historical ticket replay as an eval set (`droid exec`)
