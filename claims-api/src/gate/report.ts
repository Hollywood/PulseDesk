import type { AssertionRecord, AssertionStatus, ParsedFailure, ParsedReport } from "./certify.js";

interface RawAssertionResult {
  ancestorTitles?: string[];
  title?: string;
  fullName?: string;
  status?: string;
  failureMessages?: string[];
}

interface RawTestResult {
  status?: string;
  message?: string;
  assertionResults?: RawAssertionResult[];
}

interface RawReport {
  startTime?: number;
  numTotalTests?: number;
  numPassedTests?: number;
  numFailedTests?: number;
  numPendingTests?: number;
  numTodoTests?: number;
  testResults?: RawTestResult[];
}

const ASSERTION_PATTERN = /assertion=(\S+)\s+expected=(-?\d+)\s+actual=(-?\d+)/;

function parseFailureMessage(message: string): ParsedFailure {
  const match = ASSERTION_PATTERN.exec(message);
  if (!match) {
    return { assertion: null, expected: null, actual: null };
  }
  return { assertion: match[1], expected: Number(match[2]), actual: Number(match[3]) };
}

function normalizeStatus(status: string | undefined): AssertionStatus {
  switch (status) {
    case "passed":
    case "failed":
    case "pending":
    case "todo":
    case "skipped":
      return status;
    default:
      return "skipped";
  }
}

export type ReportParse =
  | { report: ParsedReport; error: null }
  | { report: null; error: "empty" | "malformed" };

/**
 * Parses raw Vitest JSON reporter output into the normalized shape the gate
 * decision consumes. Full names are reconstructed from ancestor titles so the
 * gate does not depend on reporter-specific `fullName` formatting.
 */
export function parseVitestReport(raw: string): ReportParse {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { report: null, error: "empty" };
  }

  let data: RawReport;
  try {
    data = JSON.parse(trimmed) as RawReport;
  } catch {
    return { report: null, error: "malformed" };
  }

  if (typeof data !== "object" || data === null || typeof data.startTime !== "number") {
    return { report: null, error: "malformed" };
  }

  const assertions: AssertionRecord[] = [];
  const suiteErrors: string[] = [];

  for (const testResult of data.testResults ?? []) {
    const results = testResult.assertionResults ?? [];
    if (testResult.status === "failed" && results.length === 0) {
      suiteErrors.push(testResult.message?.slice(0, 200) ?? "suite failed to load");
      continue;
    }
    for (const assertion of results) {
      const fullName =
        assertion.ancestorTitles && assertion.ancestorTitles.length > 0
          ? [...assertion.ancestorTitles, assertion.title ?? ""].join(" > ")
          : (assertion.fullName ?? assertion.title ?? "");
      assertions.push({
        fullName,
        status: normalizeStatus(assertion.status),
        failures: (assertion.failureMessages ?? []).map(parseFailureMessage),
      });
    }
  }

  return {
    report: {
      startTime: data.startTime,
      numTotalTests: data.numTotalTests ?? assertions.length,
      numPassedTests: data.numPassedTests ?? 0,
      numFailedTests: data.numFailedTests ?? 0,
      numPendingTests: data.numPendingTests ?? 0,
      numTodoTests: data.numTodoTests ?? 0,
      suiteErrors,
      assertions,
    },
    error: null,
  };
}
