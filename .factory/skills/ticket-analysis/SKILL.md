---
name: ticket-analysis
description: Produce a structured RCA for a Ticketdroid incoming ticket fixture. Use when triaging TICKET- IDs or turning an alert into a hypothesis.
---

# Ticket Analysis (RCA)

## Instructions
1. Read the ticket from `fixtures/tickets.json`.
2. Search `claims-api/` for likely owners, recent changes, and failing tests.
3. Write the RCA in this exact shape:
   - Signal
   - Customer impact
   - Hypothesis
   - Files to inspect
   - Blast radius
   - Tests that must pass
   - What a human must verify before merge
4. Do not claim a live PagerDuty or Sentry lookup. This demo uses fixtures.
5. If confidence is low, say so and list the missing evidence.
