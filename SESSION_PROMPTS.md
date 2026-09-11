# Ticketdroid — Regular-Session Build Plan (no Mission)

Built as a sequence of scoped Droid sessions instead of a single Mission.
Same 4 milestones as MISSION_PROMPT.txt, but you approve a plan and validate
before moving to the next one — manual gates instead of Mission's built-in
ones. Keep autonomy at Medium throughout.

If asked in Part 1 "why not a Mission": for a tightly-scoped 4-hour build
you wanted a review gate at every step, not just at milestone boundaries —
Spec mode gives you the same "approve before it writes code" moment per
step, with tighter human control. Missions are for open-ended multi-day
work; this was neither.

Run these one at a time. After each, run the verification steps and only
paste the next prompt once the current one passes.

---

## 1. Skeleton + fixtures + planted bug + failing test — use Spec mode

Build the claims-api skeleton per AGENTS.md.

fixtures/tickets.json already exists — use it and its schema as-is, don't
invent a different one. TICKET-1042 describes a claims-clearinghouse
duplicate-submission caused by a retry after a gateway timeout.

Plant a matching bug in claims-api: the submit-claim handler retries on
timeout without an idempotency key/check, so a slow first request plus the
retry both land as separate submissions. Write a failing test that
reproduces this before you fix anything — do not fix it yet, this session
ends with a RED test.

No auth. No live PagerDuty. Stop once the test is red and explain your plan
for the fix before writing it.

**Validate:** `pnpm test` (or `npm test`) in `claims-api` fails on the
duplicate-claim case, for the reason described above, not some other bug.

---

## 2. Web inbox + ticket detail — Normal mode

Build the web inbox listing all 4 tickets from fixtures/tickets.json
(status, severity, service, title). Clicking a ticket opens a detail view.
Only TICKET-1042 gets a "Run Ticketdroid" button — the other 3 are
read-only fixtures (see their `wired: false` flag).

**Validate:** inbox renders all 4, detail view works, no console errors,
no auth anywhere.

---

## 3. Simulated Ticketdroid run (RCA + diff) — use Spec mode

Wire "Run Ticketdroid" on TICKET-1042 to:
1. Use the `ticket-analysis` skill to produce the RCA in its fixed shape.
2. Apply the actual fix to the planted bug (the fix the Spec in step 1
   should already have proposed) so the failing test now passes.
3. Show a 4-step timeline: Intake → Code search → Hypothesis → Patch.
4. Surface a real git diff, not a mocked one.

**Validate:** test flips from red to green, diff shown is the real diff,
timeline matches what actually happened.

---

## 4. PR view + metrics strip + demo reset — Normal mode

Build the PR view using the `pr-narrative` skill for its content. Add a
metrics strip: time-to-first-hypothesis, files touched, tests added, human
review remaining. The PR view offers only "ready for human review" — never
a merge or deploy action. Wire a reset control to the `demo-reset` skill.

**Validate:** full click path works twice in a row after reset (see
DEMO.md). Once this passes, stop — don't keep adding scope.
