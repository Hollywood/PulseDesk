import { submitClaim } from "./claims-submission.js";
import { InMemoryClearinghouse } from "./clearinghouse.js";
import { DeterministicGateway } from "./gateway.js";
import type { IdempotencyStrategy } from "./idempotency.js";
import type { ClaimRequest, SubmissionTrace } from "./types.js";

/**
 * Synthetic claim identity taken from the TICKET-1042 fixture. All identifiers
 * are synthetic; no real patient, claim, or payer data is used.
 */
export const SYNTHETIC_CLAIM: ClaimRequest = {
  claimId: "CLM-2381",
  patientRef: "PT-0417",
  payerId: "fixture-payer-01",
};

/**
 * The demo scenario: the first submission is accepted by the clearinghouse but
 * the caller sees a timeout, and exactly one retry follows.
 */
export function runAcceptedThenTimeoutRetry(strategy: IdempotencyStrategy): SubmissionTrace {
  const clearinghouse = new InMemoryClearinghouse();
  const gateway = new DeterministicGateway(clearinghouse, ["accepted_then_timeout", "accepted"]);
  return submitClaim(SYNTHETIC_CLAIM, {
    gateway,
    strategy,
    scenario: "accepted_then_timeout_retry",
  });
}

/**
 * A deterministic non-timeout rejection that must not trigger a retry.
 */
export function runNonTimeoutFailure(strategy: IdempotencyStrategy): SubmissionTrace {
  const clearinghouse = new InMemoryClearinghouse();
  const gateway = new DeterministicGateway(clearinghouse, ["non_timeout_failure"]);
  return submitClaim(SYNTHETIC_CLAIM, {
    gateway,
    strategy,
    scenario: "non_timeout_failure",
  });
}
