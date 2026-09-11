import type { ClaimRequest, IdempotencyStrategyId } from "./types.js";

export interface IdempotencyStrategy {
  readonly id: IdempotencyStrategyId;
  keyFor(request: ClaimRequest, attemptNumber: number): string | null;
}

/**
 * Planted defect: derives a distinct idempotency key for every attempt, so the
 * clearinghouse cannot recognize a retry as the same logical claim.
 */
export const perAttemptStrategy: IdempotencyStrategy = {
  id: "per-attempt",
  keyFor(request: ClaimRequest, attemptNumber: number): string {
    return `${request.claimId}:attempt-${attemptNumber}`;
  },
};

/**
 * Fix: derives one stable key from the claim identity and reuses it across
 * every attempt, letting the clearinghouse deduplicate a retry.
 */
export const stableClaimStrategy: IdempotencyStrategy = {
  id: "stable-claim",
  keyFor(request: ClaimRequest, _attemptNumber: number): string {
    return `${request.claimId}:stable`;
  },
};
