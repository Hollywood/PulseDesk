import { describe, expect, it } from "vitest";
import { perAttemptStrategy, stableClaimStrategy } from "./domain/idempotency.js";
import { runAcceptedThenTimeoutRetry, runNonTimeoutFailure } from "./domain/scenarios.js";

describe("planted retry behavior (per-attempt idempotency)", () => {
  const trace = runAcceptedThenTimeoutRetry(perAttemptStrategy);

  it("records accepted -> timeout -> retry -> accepted in order", () => {
    expect(trace.orderedEvents).toEqual(["accepted", "timeout", "retry", "accepted"]);
  });

  it("makes exactly two transport attempts", () => {
    expect(trace.transportAttempts).toBe(2);
  });

  it("creates two logical submissions because attempt keys are distinct", () => {
    expect(trace.logicalSubmissionCount).toBe(2);
    expect(trace.attemptKeys).toHaveLength(2);
    expect(trace.attemptKeys[0]).not.toBe(trace.attemptKeys[1]);
    for (const key of trace.attemptKeys) {
      expect(key).not.toBeNull();
    }
  });
});

describe("stable idempotency control (shared stable key)", () => {
  const trace = runAcceptedThenTimeoutRetry(stableClaimStrategy);

  it("still makes two transport attempts", () => {
    expect(trace.transportAttempts).toBe(2);
    expect(trace.orderedEvents).toEqual(["accepted", "timeout", "retry", "accepted"]);
  });

  it("deduplicates to exactly one logical submission using the same non-empty key", () => {
    expect(trace.logicalSubmissionCount).toBe(1);
    expect(trace.attemptKeys[0]).toBe(trace.attemptKeys[1]);
    expect(trace.attemptKeys[0]).toBeTruthy();
  });
});

describe("non-timeout failure behavior", () => {
  const trace = runNonTimeoutFailure(perAttemptStrategy);

  it("makes a single attempt and does not retry", () => {
    expect(trace.transportAttempts).toBe(1);
    expect(trace.orderedEvents).toEqual(["failed"]);
    expect(trace.orderedEvents).not.toContain("retry");
  });

  it("creates no duplicate logical submission", () => {
    expect(trace.logicalSubmissionCount).toBe(0);
  });
});
