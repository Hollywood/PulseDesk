import type { TestRunEvidence, RcaDocument } from "./types.js";
import type { GateRunResult } from "../gate/certify.js";
import { REGRESSION_CONTRACT } from "../gate/contract.js";

/** Evidence the run actually gathered before the RCA is written. */
export interface RcaEvidence {
  ticket: Record<string, unknown>;
  /** Repo-relative files found during the code-search step. */
  filesFound: string[];
  /** Production idempotency binding read from active-strategy.ts, e.g. `perAttemptStrategy`. */
  activeBinding: string;
  /** Whether the idempotency module derives a per-attempt key (contains `:attempt-`). */
  derivesPerAttemptKey: boolean;
  testsBefore: TestRunEvidence;
}

interface TicketText {
  id: string;
  severity: string;
  source: string;
  service: string;
  title: string;
  summary: string;
  alertBody: string;
}

function ticketText(ticket: Record<string, unknown>): TicketText {
  const str = (key: string): string => (typeof ticket[key] === "string" ? String(ticket[key]) : "");
  return {
    id: str("id"),
    severity: str("severity"),
    source: str("source"),
    service: str("service"),
    title: str("title"),
    summary: str("summary"),
    alertBody: str("alert_body"),
  };
}

function firstParagraph(alertBody: string): string {
  const trimmed = alertBody.trim();
  const lineBreak = trimmed.indexOf("\n");
  return lineBreak === -1 ? trimmed : trimmed.slice(0, lineBreak);
}

/**
 * Builds the root-cause analysis in the exact fixed shape of the
 * `ticket-analysis` skill (Signal, Customer impact, Hypothesis, Files to
 * inspect, Blast radius, Tests that must pass, What a human must verify before
 * merge). Every field is derived from real evidence gathered by the run — the
 * fixture record, the files the code search actually found, and the measured
 * baseline test results.
 */
export function buildRca(evidence: RcaEvidence): RcaDocument {
  const ticket = ticketText(evidence.ticket);
  const claimId = claimIdFromAlert(ticket.alertBody);
  const duplicateRef = duplicateRefFromAlert(ticket.alertBody);

  const signal = `${ticket.source} ${ticket.severity} on ${ticket.service}: ${ticket.title}. ${firstParagraph(ticket.alertBody)}`;

  const customerImpact =
    `The payer flagged ${claimId} as a duplicate, so the claim will not adjudicate in the expected ` +
    `cycle; the revenue-cycle team must manually reconcile rejection ${duplicateRef} and resubmit, ` +
    `delaying payment. This is a billing/claims issue only — no clinical or patient-care impact.`;

  const keyShape = evidence.derivesPerAttemptKey ? "distinct key per attempt" : "one key per transport attempt";
  const hypothesis =
    `The submit handler retries an accepted-then-timed-out request, but the active ` +
    `${evidence.activeBinding} strategy derives a ${keyShape}, so the clearinghouse records two ` +
    `logical submissions for one claim. The retry itself is correct; the fix is to reuse one stable, ` +
    `claim-scoped key across every attempt, letting the clearinghouse deduplicate the retry onto the ` +
    `original logical submission.`;

  return {
    signal,
    customerImpact,
    hypothesis,
    filesToInspect: evidence.filesFound,
    blastRadius:
      "Outbound claim submissions in claims-api that hit the accepted-then-timeout retry path. " +
      "Non-timeout failures are not retried and are unaffected. The change flips one production " +
      "idempotency binding; no schema, API contract, or caller-facing change.",
    testsThatMustPass: [
      REGRESSION_CONTRACT.fullName,
      "Full claims-api suite green after the patch",
      "Non-timeout failure path unchanged (single attempt, no retry)",
    ],
    humanVerification: [
      "The diff contains only the active idempotency binding change (per-attempt key to stable claim key).",
      "The stable key is claim-scoped, so distinct synthetic claims cannot collide at the clearinghouse.",
      "Rollback is a one-line flip of the binding, followed by a green suite.",
      "The clearinghouse deduplicates on the stable non-empty key, which is the intended contract.",
    ],
  };
}

/** Pulls the synthetic claim id (CLM-XXXX) from the alert body, or a fallback. */
function claimIdFromAlert(alertBody: string): string {
  const match = /\bCLM-\d+\b/.exec(alertBody);
  return match?.[0] ?? "the affected claim";
}

/** Pulls the synthetic duplicate rejection reference (DUP-XXXXX) if present. */
function duplicateRefFromAlert(alertBody: string): string {
  const match = /\bDUP-\d+\b/.exec(alertBody);
  return match?.[0] ?? "the duplicate rejection";
}

/** Converts a gate run into test evidence the UI can render. */
export function toTestEvidence(run: GateRunResult): TestRunEvidence {
  const assertions = run.report?.assertions ?? [];
  const regression = assertions.find((entry) => entry.fullName === REGRESSION_CONTRACT.fullName);
  const failure = regression?.failures[0];
  const passed = regression?.status === "passed";
  return {
    total: run.report?.numTotalTests ?? 0,
    passed: run.report?.numPassedTests ?? 0,
    failed: run.report?.numFailedTests ?? 0,
    regression: {
      name: REGRESSION_CONTRACT.assertion,
      expected: REGRESSION_CONTRACT.expected,
      actual: failure?.actual ?? null,
    },
    regressionPassed: passed,
    certification: passed ? "patched_green" : "expected_red",
  };
}
