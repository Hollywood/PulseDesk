---
name: pr-narrative
description: Write a customer-facing PR description from a Ticketdroid diff. Use when summarizing the patch or filling the PR view.
---

# PR Narrative

## Instructions
1. Read the current diff against the pre-patch baseline.
2. Write:
   - Title
   - Why this change exists (ticket ID + customer impact)
   - What changed
   - Tests added or updated
   - Risk / rollback
   - Human verification checklist
3. Make explicit that this PR requires human approval before merge — the
   agent never merges or deploys on its own.
4. Keep it readable by an EM, not only by the author.
