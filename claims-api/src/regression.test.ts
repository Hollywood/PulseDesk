import { describe, it } from "vitest";
import { ACTIVE_STRATEGY } from "./domain/active-strategy.js";
import { runAcceptedThenTimeoutRetry } from "./domain/scenarios.js";
import { EXPECTED_LOGICAL_SUBMISSIONS, LogicalSubmissionAssertionError } from "./gate/contract.js";

/**
 * The named TICKET-1042 regression. It exercises the production active strategy
 * and requires exactly one logical submission. In planted (buggy) state the
 * active strategy uses per-attempt keys, so the actual count is two and this is
 * the single intentional raw failure. The demo patch flips the active strategy,
 * turning this green.
 */
describe("TICKET-1042 duplicate claim submission regression", () => {
  it("submits exactly one logical claim across an accepted-then-timeout retry", () => {
    const trace = runAcceptedThenTimeoutRetry(ACTIVE_STRATEGY);
    if (trace.logicalSubmissionCount !== EXPECTED_LOGICAL_SUBMISSIONS) {
      throw new LogicalSubmissionAssertionError(EXPECTED_LOGICAL_SUBMISSIONS, trace.logicalSubmissionCount);
    }
  });
});
