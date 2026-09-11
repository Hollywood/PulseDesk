import type { ClaimRequest } from "./types.js";

export interface ClearinghouseAcceptance {
  clearinghouseRef: string;
  logicalSubmissionIndex: number;
  deduplicated: boolean;
}

/**
 * Deterministic in-memory stand-in for the payer clearinghouse. It records one
 * logical submission per distinct non-empty idempotency key; a repeated
 * non-empty key is deduplicated onto the original logical submission. No
 * timers, randomness, network, or wall-clock behavior is involved.
 */
export class InMemoryClearinghouse {
  private readonly logicalSubmissions: { key: string | null; claimId: string }[] = [];
  private readonly keyIndex = new Map<string, number>();

  record(request: ClaimRequest, idempotencyKey: string | null): ClearinghouseAcceptance {
    if (idempotencyKey !== null && idempotencyKey !== "" && this.keyIndex.has(idempotencyKey)) {
      const existing = this.keyIndex.get(idempotencyKey)!;
      return {
        clearinghouseRef: `CH-REF-${existing + 1}`,
        logicalSubmissionIndex: existing,
        deduplicated: true,
      };
    }

    const index = this.logicalSubmissions.length;
    this.logicalSubmissions.push({ key: idempotencyKey, claimId: request.claimId });
    if (idempotencyKey !== null && idempotencyKey !== "") {
      this.keyIndex.set(idempotencyKey, index);
    }
    return {
      clearinghouseRef: `CH-REF-${index + 1}`,
      logicalSubmissionIndex: index,
      deduplicated: false,
    };
  }

  get logicalSubmissionCount(): number {
    return this.logicalSubmissions.length;
  }
}
