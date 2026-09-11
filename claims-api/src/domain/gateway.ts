import type { InMemoryClearinghouse } from "./clearinghouse.js";
import type { ClaimRequest, TransportAttempt } from "./types.js";

export type FaultKind = "accepted" | "accepted_then_timeout" | "non_timeout_failure";

/**
 * Ambiguous gateway response: the clearinghouse accepted and recorded the
 * submission, but the caller observed a timeout and cannot tell whether it
 * landed.
 */
export class GatewayTimeoutError extends Error {
  readonly code = "gateway_timeout";
  constructor(readonly acceptedRef: string) {
    super("clearinghouse gateway timed out after acceptance");
    this.name = "GatewayTimeoutError";
  }
}

/**
 * A deterministic non-timeout rejection. The clearinghouse never recorded the
 * submission, so it must not be retried.
 */
export class GatewayFailureError extends Error {
  readonly code = "gateway_rejected";
  constructor() {
    super("clearinghouse rejected the submission");
    this.name = "GatewayFailureError";
  }
}

export interface AttemptResult {
  clearinghouseRef: string;
  deduplicated: boolean;
}

/**
 * Wraps a clearinghouse with an injected, ordered fault plan so every scenario
 * is fully deterministic and free of timers, randomness, or network access.
 */
export class DeterministicGateway {
  private cursor = 0;

  constructor(
    private readonly clearinghouse: InMemoryClearinghouse,
    private readonly plan: readonly FaultKind[],
  ) {}

  get logicalSubmissionCount(): number {
    return this.clearinghouse.logicalSubmissionCount;
  }

  send(request: ClaimRequest, attempt: TransportAttempt): AttemptResult {
    const fault: FaultKind = this.plan[this.cursor] ?? "accepted";
    this.cursor += 1;

    if (fault === "non_timeout_failure") {
      throw new GatewayFailureError();
    }

    const acceptance = this.clearinghouse.record(request, attempt.idempotencyKey);
    if (fault === "accepted_then_timeout") {
      throw new GatewayTimeoutError(acceptance.clearinghouseRef);
    }
    return { clearinghouseRef: acceptance.clearinghouseRef, deduplicated: acceptance.deduplicated };
  }
}
