export type IdempotencyStrategyId = "per-attempt" | "stable-claim";

export interface ClaimRequest {
  claimId: string;
  patientRef: string;
  payerId: string;
}

export interface TransportAttempt {
  attemptNumber: number;
  idempotencyKey: string | null;
}

export type TraceEventType =
  | "attempt_accepted"
  | "attempt_timeout"
  | "retry_scheduled"
  | "attempt_failed";

export interface TraceEvent {
  type: TraceEventType;
  attemptNumber: number;
  idempotencyKey: string | null;
}

/**
 * A deterministic, structured record of one claim submission scenario. It is
 * pure data derived only from the injected fault plan and idempotency strategy,
 * so identical inputs always produce identical traces across fresh processes.
 */
export interface SubmissionTrace {
  scenario: string;
  strategyId: IdempotencyStrategyId;
  events: TraceEvent[];
  orderedEvents: string[];
  attemptKeys: (string | null)[];
  transportAttempts: number;
  logicalSubmissionCount: number;
}
