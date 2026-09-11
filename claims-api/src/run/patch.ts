import { readFileSync } from "node:fs";
import { RunError } from "./types.js";

/**
 * The exact source lines the TICKET-1042 patch replaces in
 * `domain/active-strategy.ts`. The gate classifies the workspace by reading
 * this binding, so these strings are a stable contract.
 */
const PER_ATTEMPT_IMPORT = 'import { perAttemptStrategy } from "./idempotency.js";';
const PER_ATTEMPT_BINDING = "export const ACTIVE_STRATEGY: IdempotencyStrategy = perAttemptStrategy;";
export const STABLE_CLAIM_IMPORT = 'import { stableClaimStrategy } from "./idempotency.js";';
export const STABLE_CLAIM_BINDING = "export const ACTIVE_STRATEGY: IdempotencyStrategy = stableClaimStrategy;";

/**
 * Derives the patched source of `domain/active-strategy.ts` from the pristine
 * planted-bug source by replacing exactly the two lines where the production
 * idempotency binding changes. The surrounding comment is intentionally left
 * untouched so the real diff stays minimal and reviewable.
 *
 * Fails with a bounded error when the baseline no longer has the planted
 * shape, which prevents the run from mutating an unexpected file.
 */
export function derivePatchedSource(baselineSource: string): string {
  if (!baselineSource.includes(PER_ATTEMPT_IMPORT)) {
    throw new RunError(
      "unexpected_baseline",
      "The active-strategy baseline does not match the planted TICKET-1042 shape.",
    );
  }
  if (!baselineSource.includes(PER_ATTEMPT_BINDING)) {
    throw new RunError(
      "unexpected_baseline",
      "The active-strategy baseline does not match the planted TICKET-1042 shape.",
    );
  }

  const withImport = baselineSource.replace(PER_ATTEMPT_IMPORT, STABLE_CLAIM_IMPORT);
  return withImport.replace(PER_ATTEMPT_BINDING, STABLE_CLAIM_BINDING);
}

/** Reads the current active-strategy source from disk. */
export function readActiveStrategySource(path: string): string {
  return readFileSync(path, "utf8");
}
