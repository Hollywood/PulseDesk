import { DeterministicGateway, GatewayTimeoutError } from "./gateway.js";
import type { IdempotencyStrategy } from "./idempotency.js";
import type { ClaimRequest, SubmissionTrace, TraceEvent } from "./types.js";

export interface SubmitOptions {
  gateway: DeterministicGateway;
  strategy: IdempotencyStrategy;
  scenario?: string;
  maxRetries?: number;
}

const ORDERED_EVENT_NAME: Record<TraceEvent["type"], string> = {
  attempt_accepted: "accepted",
  attempt_timeout: "timeout",
  retry_scheduled: "retry",
  attempt_failed: "failed",
};

/**
 * Submits one claim through the injected gateway. On an ambiguous
 * accepted-then-timeout response it retries exactly `maxRetries` times; a
 * non-timeout failure is never retried. The returned trace captures the
 * ordered events, the idempotency key used per transport attempt, and the
 * resulting logical submission count.
 */
export function submitClaim(request: ClaimRequest, options: SubmitOptions): SubmissionTrace {
  const maxRetries = options.maxRetries ?? 1;
  const events: TraceEvent[] = [];
  const attemptKeys: (string | null)[] = [];
  let transportAttempts = 0;
  let attemptNumber = 0;
  let retriesUsed = 0;

  for (;;) {
    attemptNumber += 1;
    const idempotencyKey = options.strategy.keyFor(request, attemptNumber);
    attemptKeys.push(idempotencyKey);
    transportAttempts += 1;

    try {
      options.gateway.send(request, { attemptNumber, idempotencyKey });
      events.push({ type: "attempt_accepted", attemptNumber, idempotencyKey });
      break;
    } catch (error) {
      if (error instanceof GatewayTimeoutError) {
        // The clearinghouse recorded this attempt before the timeout surfaced.
        events.push({ type: "attempt_accepted", attemptNumber, idempotencyKey });
        events.push({ type: "attempt_timeout", attemptNumber, idempotencyKey });
        if (retriesUsed < maxRetries) {
          retriesUsed += 1;
          events.push({ type: "retry_scheduled", attemptNumber: attemptNumber + 1, idempotencyKey: null });
          continue;
        }
        break;
      }
      events.push({ type: "attempt_failed", attemptNumber, idempotencyKey });
      break;
    }
  }

  return {
    scenario: options.scenario ?? "unnamed",
    strategyId: options.strategy.id,
    events,
    orderedEvents: events.map((event) => ORDERED_EVENT_NAME[event.type]),
    attemptKeys,
    transportAttempts,
    logicalSubmissionCount: options.gateway.logicalSubmissionCount,
  };
}
