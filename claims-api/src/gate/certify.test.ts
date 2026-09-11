import { describe, expect, it } from "vitest";
import type {
  AssertionRecord,
  CertifyOptions,
  GateRunResult,
  ParsedReport,
  WorkspaceState,
} from "./certify.js";
import { certifyGate } from "./certify.js";
import { REGRESSION_CONTRACT } from "./contract.js";

const NOW = 1_000_000_000_000;
const OPTIONS: CertifyOptions = { now: NOW, staleThresholdMs: 600_000 };

const REGRESSION_FAILURE: AssertionRecord = {
  fullName: REGRESSION_CONTRACT.fullName,
  status: "failed",
  failures: [
    {
      assertion: REGRESSION_CONTRACT.assertion,
      expected: REGRESSION_CONTRACT.expected,
      actual: REGRESSION_CONTRACT.actualWhenBuggy,
    },
  ],
};

const REGRESSION_PASS: AssertionRecord = {
  fullName: REGRESSION_CONTRACT.fullName,
  status: "passed",
  failures: [],
};

const HEALTHY: AssertionRecord = {
  fullName: "planted retry behavior > makes exactly two transport attempts",
  status: "passed",
  failures: [],
};

function report(overrides: Partial<ParsedReport> = {}): ParsedReport {
  return {
    startTime: NOW - 1_000,
    numTotalTests: 3,
    numPassedTests: 2,
    numFailedTests: 1,
    numPendingTests: 0,
    numTodoTests: 0,
    suiteErrors: [],
    assertions: [REGRESSION_FAILURE, HEALTHY, { ...HEALTHY, fullName: "other > passes" }],
    ...overrides,
  };
}

function run(report: ParsedReport | null, overrides: Partial<GateRunResult> = {}): GateRunResult {
  return {
    spawn: "ok",
    timedOut: false,
    signal: null,
    exitCode: report ? 1 : null,
    report,
    reportError: null,
    ...overrides,
  };
}

function certify(state: WorkspaceState, runResult: GateRunResult) {
  return certifyGate(state, runResult, REGRESSION_CONTRACT, OPTIONS);
}

describe("certifyGate accepted outcomes", () => {
  it("certifies expected red in buggy state", () => {
    const decision = certify("buggy", run(report()));
    expect(decision).toMatchObject({ ok: true, certification: "expected_red" });
  });

  it("certifies patched green in patched state", () => {
    const patched = report({
      numFailedTests: 0,
      numPassedTests: 3,
      assertions: [REGRESSION_PASS, HEALTHY, { ...HEALTHY, fullName: "other > passes" }],
    });
    const decision = certify("patched", run(patched, { exitCode: 0 }));
    expect(decision).toMatchObject({ ok: true, certification: "patched_green" });
  });
});

describe("certifyGate rejects invalid outcomes", () => {
  const cases: { name: string; state: WorkspaceState; runResult: GateRunResult; code: string }[] = [
    {
      name: "dirty state",
      state: "dirty",
      runResult: run(report()),
      code: "dirty_state",
    },
    {
      name: "unknown state",
      state: "unknown",
      runResult: run(report()),
      code: "unknown_state",
    },
    {
      name: "spawn failure",
      state: "buggy",
      runResult: run(null, { spawn: "spawn_error", reportError: "missing" }),
      code: "spawn_failure",
    },
    {
      name: "timeout",
      state: "buggy",
      runResult: run(null, { timedOut: true, reportError: "missing" }),
      code: "timeout",
    },
    {
      name: "signal failure",
      state: "buggy",
      runResult: run(null, { signal: "SIGKILL", reportError: "missing" }),
      code: "signal_failure",
    },
    {
      name: "missing report",
      state: "buggy",
      runResult: run(null, { reportError: "missing" }),
      code: "report_missing",
    },
    {
      name: "empty report",
      state: "buggy",
      runResult: run(null, { reportError: "empty" }),
      code: "report_empty",
    },
    {
      name: "malformed report",
      state: "buggy",
      runResult: run(null, { reportError: "malformed" }),
      code: "report_malformed",
    },
    {
      name: "stale report",
      state: "buggy",
      runResult: run(report({ startTime: NOW - 5_000_000 })),
      code: "stale_report",
    },
    {
      name: "setup or compilation failure",
      state: "buggy",
      runResult: run(report({ suiteErrors: ["failed to import module"] })),
      code: "setup_or_compilation_failure",
    },
    {
      name: "zero tests",
      state: "buggy",
      runResult: run(report({ numTotalTests: 0, numFailedTests: 0, numPassedTests: 0, assertions: [] })),
      code: "zero_tests",
    },
    {
      name: "skipped tests",
      state: "buggy",
      runResult: run(report({ numPendingTests: 1 })),
      code: "skipped_tests",
    },
    {
      name: "unexpectedly green baseline",
      state: "buggy",
      runResult: run(
        report({
          numFailedTests: 0,
          numPassedTests: 3,
          assertions: [REGRESSION_PASS, HEALTHY, { ...HEALTHY, fullName: "other > passes" }],
        }),
      ),
      code: "unexpected_green_baseline",
    },
    {
      name: "expected plus unrelated failure",
      state: "buggy",
      runResult: run(
        report({
          numFailedTests: 2,
          assertions: [
            REGRESSION_FAILURE,
            { fullName: "other > breaks", status: "failed", failures: [{ assertion: null, expected: null, actual: null }] },
            HEALTHY,
          ],
        }),
      ),
      code: "unrelated_failure",
    },
    {
      name: "wrong test failed",
      state: "buggy",
      runResult: run(
        report({
          assertions: [
            { fullName: "other > breaks", status: "failed", failures: [{ assertion: null, expected: null, actual: null }] },
            HEALTHY,
            { ...HEALTHY, fullName: "other > passes" },
          ],
        }),
      ),
      code: "wrong_test",
    },
    {
      name: "wrong assertion values",
      state: "buggy",
      runResult: run(
        report({
          assertions: [
            {
              fullName: REGRESSION_CONTRACT.fullName,
              status: "failed",
              failures: [{ assertion: REGRESSION_CONTRACT.assertion, expected: 1, actual: 3 }],
            },
            HEALTHY,
            { ...HEALTHY, fullName: "other > passes" },
          ],
        }),
      ),
      code: "wrong_values",
    },
    {
      name: "patched suite not green",
      state: "patched",
      runResult: run(report()),
      code: "patched_suite_not_green",
    },
    {
      name: "patched regression missing",
      state: "patched",
      runResult: run(
        report({
          numFailedTests: 0,
          numPassedTests: 2,
          assertions: [HEALTHY, { ...HEALTHY, fullName: "other > passes" }],
        }),
        { exitCode: 0 },
      ),
      code: "missing_patched_regression",
    },
  ];

  for (const testCase of cases) {
    it(`rejects ${testCase.name}`, () => {
      const decision = certify(testCase.state, testCase.runResult);
      expect(decision.ok).toBe(false);
      if (!decision.ok) {
        expect(decision.code).toBe(testCase.code);
        expect(decision.reason.length).toBeGreaterThan(0);
      }
    });
  }
});
