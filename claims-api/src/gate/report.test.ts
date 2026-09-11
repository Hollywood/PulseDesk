import { describe, expect, it } from "vitest";
import { REGRESSION_CONTRACT } from "./contract.js";
import { parseVitestReport } from "./report.js";

describe("parseVitestReport", () => {
  it("reports empty input", () => {
    expect(parseVitestReport("   ")).toEqual({ report: null, error: "empty" });
  });

  it("reports malformed JSON", () => {
    expect(parseVitestReport("{not json")).toEqual({ report: null, error: "malformed" });
  });

  it("reports malformed when startTime is absent", () => {
    expect(parseVitestReport(JSON.stringify({ numTotalTests: 1 }))).toEqual({
      report: null,
      error: "malformed",
    });
  });

  it("reconstructs full names and parses structured assertion failures", () => {
    const raw = JSON.stringify({
      startTime: 1000,
      numTotalTests: 2,
      numPassedTests: 1,
      numFailedTests: 1,
      numPendingTests: 0,
      numTodoTests: 0,
      testResults: [
        {
          status: "failed",
          assertionResults: [
            {
              ancestorTitles: ["TICKET-1042 duplicate claim submission regression"],
              title: "submits exactly one logical claim across an accepted-then-timeout retry",
              status: "failed",
              failureMessages: [
                "Error: gate-assertion assertion=logical_submission_count expected=1 actual=2\n at file",
              ],
            },
            {
              ancestorTitles: ["planted retry behavior"],
              title: "passes",
              status: "passed",
              failureMessages: [],
            },
          ],
        },
      ],
    });

    const parsed = parseVitestReport(raw);
    expect(parsed.error).toBeNull();
    const failing = parsed.report?.assertions.find((assertion) => assertion.status === "failed");
    expect(failing?.fullName).toBe(REGRESSION_CONTRACT.fullName);
    expect(failing?.failures[0]).toEqual({
      assertion: "logical_submission_count",
      expected: 1,
      actual: 2,
    });
  });

  it("captures suite-level load errors", () => {
    const raw = JSON.stringify({
      startTime: 1000,
      numTotalTests: 0,
      testResults: [{ status: "failed", message: "Failed to load module", assertionResults: [] }],
    });
    const parsed = parseVitestReport(raw);
    expect(parsed.report?.suiteErrors.length).toBe(1);
  });
});
