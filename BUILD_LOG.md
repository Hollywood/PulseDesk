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

## Where the agent drifted or failed, and how I recovered
- Not a failure, but worth noting as process evidence: before finalizing
  the validation contract, it ran its own review pass and caught real gaps
  on its own — a listener-health check that would've passed for any
  process on port 4310 (not necessarily mine), no defined behavior for a
  run interrupted by a restart, and stale-run state not being invalidated.
  It fixed these itself, explicitly staying within the two-acceptance-cycle
  cap rather than using the audit as a scope-expansion excuse. I let it
  proceed without intervening — nothing to correct here.
- (Update this section if/when a real intervention happens — the panel
  wants "one wrong turn and the correction," and an agent catching its own
  gap isn't quite that; a moment where I had to redirect it is the
  stronger story if one occurs.)

## What I'd do in week 2
- Real PagerDuty + GitHub MCP ingest
- `reviewer` custom droid as a required gate
- Historical ticket replay as an eval set (`droid exec`)
