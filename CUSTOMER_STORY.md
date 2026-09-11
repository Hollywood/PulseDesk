# Ticketdroid — Healthcare Customer Story

Everything below replaces the fintech ("Empower-style payments company")
framing from the original playbook with a healthcare framing. Keep the
underlying motion identical: signal in → RCA → scoped patch → reviewable PR,
human merges.

## Customer

A regional, multi-facility health system (hospital network) — fictional for
the interview, e.g. invent a name like "Cascade Health" or similar. Not a
real organization; don't imply otherwise.

Why this customer still works as the wedge:
- IDE copilots (Copilot, Cursor) live in the editor. Incidents in a health
  system live in PagerDuty/Sentry, EHR-adjacent revenue cycle systems, and
  multiple repos owned by different platform teams — same gap as the
  original pitch.
- The planted bug (duplicate insurance claim submission on retry) is a
  **revenue cycle / billing** problem, deliberately not clinical. That keeps
  the demo out of patient-safety and clinical-liability territory while
  still being a real, expensive, on-call-worthy problem: duplicate claims
  trigger payer compliance review, revenue reconciliation work, and
  possible overpayment/fraud-flag exposure.
- Easy to frame as a 30-day pilot: one claims service, one on-call rotation,
  three metrics — same shape as the original.

## Room roles for Part 2

- **Alex, VP IT / CIO** — economic buyer. Cost, risk, hiring plan, vendor
  security review.
- **Priya, Head of DevEx / Platform Engineering** — tool sprawl, adoption,
  how this fits alongside Copilot/Cursor already in use.
- **Marcus, Engineering Manager, Revenue Cycle / Claims Platform** — owns
  pages, missed SLAs, and the compliance headache duplicate claims cause.
- **Optional: skeptical Staff Engineer** who loves Cursor.
- **You** — Factory Solutions Engineer.

## User / problem / value (memorize)

- **User:** On-call engineer on the claims platform + the EM who owns MTTR
  and page load.
- **Problem:** A Sev-2 ticket lands at 1:14am — a retry silently resubmitted
  a claim, and now the payer's system shows a duplicate. That's 40 minutes
  of "which service, which deploy, which dashboard, which Slack thread,"
  then 20 minutes of actually coding the fix. Copilot helps the last 20. The
  business (and compliance team) pays for the first 40, every night — plus
  the downstream cost of a duplicate-billing flag with a payer.
- **Value:** First-pass RCA and a draft PR before the human sits down.
  Humans review and merge. MTTR and interrupted-sleep hours drop. So does
  the compliance exposure from duplicate submissions sitting unresolved.
  DevEx stops being "we bought Copilot seats."

## Positioning note — no healthcare-specific Factory case study exists

I checked (Sept 2026): Factory.ai does **not** currently publish a named
healthcare customer case study. What they do have:

- A generic healthcare industry/marketing page:
  `factory.ai/industries/healthcare` ("HIPAA-Ready AI Development Agents")
- A BAA (Business Associate Agreement) page: `factory.ai/baa`
- Named case studies in **fintech** (Empower — 40% faster incident
  response, 50% faster PR creation-to-approval; Nav — 2x faster feature
  cycles), **security/supply chain** (Chainguard — 2-week continuous
  session, 80 packages across 6 repos), and **AI infra** (Groq —
  model-agnostic agents, 5x faster quick-turn tasks).

How to use this honestly in the room:
- Cite Empower's MTTR/incident-response numbers as **pattern evidence**
  ("this is the class of result Factory's incident-response pattern
  produces elsewhere"), not as a healthcare-specific proof point.
- When compliance/security comes up (it will, given the vertical), point to
  the HIPAA-readiness page and BAA availability as a specific, current
  detail — but explicitly don't overclaim certifications you haven't
  verified live. This mirrors the original playbook's rule: "Do not
  overclaim certifications unless you have the current security page in
  front of you."
- Frame it as: "You'd be an early healthcare reference, not customer #50" —
  that's a legitimate pitch to a design-partner-minded buyer, and it's
  honest.

## Discovery question tweaks for healthcare

Same shape as the original 8 questions, with these swapped/added:
- "How is PHI/compliance review handled today when an agent or contractor
  touches revenue-cycle code — is there a existing BAA process for tools
  like Copilot or Cursor?"
- "Which EHR or claims-clearinghouse integrations would this need to stay
  read-only or fixture-based in a pilot?"
- "What's your current duplicate-claim / denial rate, and who owns that
  number?"

## Objection handling addition

**"This touches PHI / compliance is a bigger deal for us than for a fintech
company."**
Agree — that's exactly why the MVP is scoped to revenue-cycle/billing with
synthetic data, not clinical systems, and why a pilot would start read-only
against a non-prod claims service with a BAA in place before anything
touches real data. Factory publishes HIPAA-readiness and BAA support today;
verify the current terms with them directly before you commit to a date in
front of the customer.
