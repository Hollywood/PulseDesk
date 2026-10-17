import type { IdempotencyStrategy } from "./idempotency.js";
import { stableClaimStrategy } from "./idempotency.js";

/**
 * The single production idempotency binding for claim submission.
 *
 * Retries reuse a stable claim-scoped idempotency key so a timeout cannot create
 * a duplicate logical submission. The regression suite protects this binding.
 */
export const ACTIVE_STRATEGY: IdempotencyStrategy = stableClaimStrategy;
