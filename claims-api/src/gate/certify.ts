import type { RegressionContract } from "./contract.js";

export type WorkspaceState = "buggy" | "patched" | "dirty" | "unknown";

export type AssertionStatus = "passed" | "failed" | "pending" | "todo" | "skipped";

export interface ParsedFailure {
  assertion: string | null;
  expected: number | null;
  actual: number | null;
}

export interface AssertionRecord {
  fullName: string;
  status: AssertionStatus;
  failures: ParsedFailure[];
}

export interface ParsedReport {
  startTime: number;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  suiteErrors: string[];
  assertions: AssertionRecord[];
}

export interface GateRunResult {
  spawn: "ok" | "spawn_error";
  timedOut: boolean;
  signal: string | null;
  exitCode: number | null;
  report: ParsedReport | null;
  reportError: "missing" | "empty" | "malformed" | null;
}

export interface CertifyOptions {
  now: number;
  staleThresholdMs: number;
}

export type GateDecision =
  | {
      ok: true;
      state: WorkspaceState;
      certification: "expected_red" | "patched_green";
      reason: string;
    }
  | {
      ok: false;
      state: WorkspaceState;
      code: string;
      reason: string;
    };

function reject(state: WorkspaceState, code: string, reason: string): GateDecision {
  return { ok: false, state, code, reason };
}

/**
 * Pure, table-testable gate decision. It never treats a generic nonzero exit as
 * success: the verdict is derived from the workspace state plus a fresh,
 * complete, machine-readable test report.
 */
export function certifyGate(
  state: WorkspaceState,
  run: GateRunResult,
  contract: RegressionContract,
  options: CertifyOptions,
): GateDecision {
  if (run.spawn === "spawn_error") {
    return reject(state, "spawn_failure", "test runner failed to start");
  }
  if (run.timedOut) {
    return reject(state, "timeout", "test run exceeded the allowed time");
  }
  if (run.signal !== null) {
    return reject(state, "signal_failure", "test process terminated by a signal");
  }

  if (state === "dirty") {
    return reject(state, "dirty_state", "workspace has unexpected local edits");
  }
  if (state === "unknown") {
    return reject(state, "unknown_state", "workspace state could not be verified");
  }

  if (run.report === null) {
    if (run.reportError === "empty") {
      return reject(state, "report_empty", "machine-readable test report was empty");
    }
    if (run.reportError === "malformed") {
      return reject(state, "report_malformed", "machine-readable test report could not be parsed");
    }
    return reject(state, "report_missing", "machine-readable test report was not produced");
  }

  const report = run.report;
  if (options.now - report.startTime > options.staleThresholdMs) {
    return reject(state, "stale_report", "machine-readable test report was stale");
  }
  if (report.suiteErrors.length > 0) {
    return reject(state, "setup_or_compilation_failure", "a test suite failed to load or compile");
  }
  if (report.numTotalTests <= 0) {
    return reject(state, "zero_tests", "no tests were discovered");
  }

  const hasNonRunnable =
    report.numPendingTests > 0 ||
    report.numTodoTests > 0 ||
    report.assertions.some(
      (assertion) =>
        assertion.status === "pending" ||
        assertion.status === "todo" ||
        assertion.status === "skipped",
    );
  if (hasNonRunnable) {
    return reject(state, "skipped_tests", "tests were skipped, pending, or todo");
  }

  const failedAssertions = report.assertions.filter((assertion) => assertion.status === "failed");

  if (state === "patched") {
    if (report.numFailedTests > 0 || failedAssertions.length > 0) {
      return reject(state, "patched_suite_not_green", "patched state requires a fully green suite");
    }
    const regression = report.assertions.find((assertion) => assertion.fullName === contract.fullName);
    if (!regression || regression.status !== "passed") {
      return reject(
        state,
        "missing_patched_regression",
        "patched state is missing the planted regression test",
      );
    }
    return {
      ok: true,
      state,
      certification: "patched_green",
      reason: "patched state certified: full suite green including the planted regression",
    };
  }

  // state === "buggy"
  if (report.numFailedTests === 0 && failedAssertions.length === 0) {
    return reject(
      state,
      "unexpected_green_baseline",
      "buggy state expected the planted regression to fail but all tests passed",
    );
  }
  if (report.numFailedTests > 1 || failedAssertions.length > 1) {
    return reject(state, "unrelated_failure", "additional unrelated test failures were present");
  }

  const failed = failedAssertions[0];
  if (!failed) {
    return reject(state, "unrelated_failure", "a failing suite reported no failing assertion");
  }
  if (failed.fullName !== contract.fullName) {
    return reject(state, "wrong_test", "an unexpected test failed instead of the planted regression");
  }
  const matched = failed.failures.some(
    (failure) =>
      failure.assertion === contract.assertion &&
      failure.expected === contract.expected &&
      failure.actual === contract.actualWhenBuggy,
  );
  if (!matched) {
    return reject(state, "wrong_values", "the planted regression failed with unexpected assertion values");
  }

  return {
    ok: true,
    state,
    certification: "expected_red",
    reason: `buggy state certified: only ${contract.assertion} failed with expected ${contract.expected} actual ${contract.actualWhenBuggy}`,
  };
}
