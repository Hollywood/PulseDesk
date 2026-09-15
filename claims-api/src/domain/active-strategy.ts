import type { IdempotencyStrategy } from "./idempotency.js";
import { stableClaimStrategy } from "./idempotency.js";

/**
 * The production idempotency binding derives one stable key per claim so a
 * retry after an ambiguous timeout is deduplicated by the clearinghouse.
 */
export const ACTIVE_STRATEGY: IdempotencyStrategy = stableClaimStrategy;
