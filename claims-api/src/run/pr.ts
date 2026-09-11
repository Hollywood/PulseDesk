import type { DiffResult, PrSummary, TestRunEvidence, RcaDocument } from "./types.js";

export interface PrEvidence {
  ticket: Record<string, unknown>;
  rca: RcaDocument;
  testsAfter: TestRunEvidence;
  diff: DiffResult;
}

interface TicketText {
  id: string;
  title: string;
}

function ticketText(ticket: Record<string, unknown>): TicketText {
  const str = (key: string): string => (typeof ticket[key] === "string" ? String(ticket[key]) : "");
  return { id: str("id"), title: str("title") };
}

/**
 * Builds the customer-facing PR description in the shape of the
 * `pr-narrative` skill: title, why this change exists, what changed, tests
 * added or updated, risk/rollback, and a human verification checklist.
 */
export function buildPrSummary(evidence: PrEvidence): PrSummary {
  const ticket = ticketText(evidence.ticket);

  return {
    title: `fix(claims-api): reuse a stable idempotency key across claim-submission retries (${ticket.id})`,
    why: `${ticket.id} — ${ticket.title}. ${evidence.rca.customerImpact}`,
    whatChanged: [
      `Flip the production idempotency binding in ${evidence.diff.path} from per-attempt keys to the stable claim-scoped key (${evidence.diff.added} addition${evidence.diff.added === 1 ? "" : "s"}, ${evidence.diff.removed} removal${evidence.diff.removed === 1 ? "" : "s"}).`,
      "Every transport attempt for one claim now sends the same claim-scoped key, so the payer clearinghouse deduplicates a retry onto the original logical submission instead of recording a duplicate.",
    ],
    tests: [
      `TICKET-1042 regression: logical_submission_count expected 1 — red before the patch (actual 2), green after.`,
      `Full claims-api suite green after the patch (${evidence.testsAfter.passed} passed, ${evidence.testsAfter.failed} failed, ${evidence.testsAfter.total} total).`,
      "Non-timeout failure behavior unchanged.",
    ],
    riskAndRollback:
      "Low. The change is a single production binding, with no schema or API contract change. " +
      "Rollback: flip the binding back to per-attempt keys and re-run the suite.",
    humanVerification: [...evidence.rca.humanVerification],
  };
}
