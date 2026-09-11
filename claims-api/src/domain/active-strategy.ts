import type { IdempotencyStrategy } from "./idempotency.js";
import { perAttemptStrategy } from "./idempotency.js";

/**
 * The single production idempotency binding for claim submission.
 *
 * The TICKET-1042 demo patch flips this one binding from `perAttemptStrategy`
 * to `stableClaimStrategy`. The state-aware test gate classifies the workspace
 * by reading this declaration, so its exact shape is a stable contract.
 */
export const ACTIVE_STRATEGY: IdempotencyStrategy = perAttemptStrategy;
