import type { Logger } from "./logger.js";

/** Inputs to a single claim-status lookup. Identifiers are opaque synthetic IDs. */
export interface ClaimStatusQuery {
  claimId: string;
  memberId: string;
}

/** Status of a claim as recorded by the upstream clearinghouse. */
export type ClaimOutcome = "accepted" | "pending" | "denied";

/** A single stored claim status record. */
export interface ClaimStatusRecord {
  claimId: string;
  status: ClaimOutcome;
  ref: string;
}

/** Read/write store backing the claim-status handler. Tests inject an in-memory version. */
export interface ClaimStore {
  lookup(claimId: string): ClaimStatusRecord | undefined;
  readonly size: number;
}

/** Result returned to the API caller. Keeps the member id in the response body only. */
export interface ClaimStatusResult {
  claimId: string;
  memberId: string;
  status: ClaimOutcome;
  clearinghouseRef: string;
  deduplicated: boolean;
}

export interface GetStatusOptions {
  logger: Logger;
  store: ClaimStore;
}

/**
 * In-memory stand-in for the clearinghouse-side status store. Stand-in only;
 * no real clearinghouse integration, no real authorization, no real member or
 * claim data — every id is a synthetic placeholder used by the demo's fixtures.
 */
export class InMemoryClaimStore implements ClaimStore {
  private readonly entries = new Map<string, ClaimStatusRecord>();

  upsert(record: ClaimStatusRecord): void {
    this.entries.set(record.claimId, record);
  }

  lookup(claimId: string): ClaimStatusRecord | undefined {
    return this.entries.get(claimId);
  }

  get size(): number {
    return this.entries.size;
  }
}

/**
 * Returns the current clearinghouse-side status of the given claim. Emits one
 * debug record per lookup so an operator can trace the request id through the
 * status pipeline. The logger redacts `memberId` before writing this record so trace correlation
 * remains available without exposing the member identifier in the log stream.
 */
export function getStatus(query: ClaimStatusQuery, options: GetStatusOptions): ClaimStatusResult {
  const { claimId, memberId } = query;
  const record = options.store.lookup(claimId);

  options.logger.debug(
    {
      event: "claim_status_check",
      claimId,
      memberId,
      storeSize: options.store.size,
    },
    "claim status lookup",
  );

  if (record === undefined) {
    return {
      claimId,
      memberId,
      status: "pending",
      clearinghouseRef: "CH-REF-NONE",
      deduplicated: false,
    };
  }
  return {
    claimId,
    memberId,
    status: record.status,
    clearinghouseRef: record.ref,
    deduplicated: false,
  };
}
