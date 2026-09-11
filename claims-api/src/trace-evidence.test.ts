import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ACTIVE_STRATEGY } from "./domain/active-strategy.js";
import { writeTraceEvidence } from "./domain/evidence.js";
import { perAttemptStrategy, stableClaimStrategy } from "./domain/idempotency.js";
import { runAcceptedThenTimeoutRetry, runNonTimeoutFailure } from "./domain/scenarios.js";

describe("structured trace evidence", () => {
  it("writes a deterministic trace artifact for every scenario", () => {
    const bundle = {
      buggyRetry: runAcceptedThenTimeoutRetry(perAttemptStrategy),
      stableRetry: runAcceptedThenTimeoutRetry(stableClaimStrategy),
      nonTimeoutFailure: runNonTimeoutFailure(perAttemptStrategy),
      activeStrategyId: ACTIVE_STRATEGY.id,
      activeRetry: runAcceptedThenTimeoutRetry(ACTIVE_STRATEGY),
    };

    const directory = fileURLToPath(new URL("../artifacts", import.meta.url));
    const file = writeTraceEvidence(directory, bundle);

    const written = JSON.parse(readFileSync(file, "utf8"));
    expect(written.buggyRetry.orderedEvents).toEqual(["accepted", "timeout", "retry", "accepted"]);
    expect(written.buggyRetry.logicalSubmissionCount).toBe(2);
    expect(written.stableRetry.logicalSubmissionCount).toBe(1);
    expect(written.nonTimeoutFailure.transportAttempts).toBe(1);
  });
});
