/**
 * The stable identity of the planted TICKET-1042 regression. The gate uses this
 * to certify that the raw suite is red for exactly the intended reason.
 */
export interface RegressionContract {
  readonly fullName: string;
  readonly assertion: string;
  readonly expected: number;
  readonly actualWhenBuggy: number;
}

export const REGRESSION_CONTRACT: RegressionContract = {
  fullName:
    "TICKET-1042 duplicate claim submission regression > submits exactly one logical claim across an accepted-then-timeout retry",
  assertion: "logical_submission_count",
  expected: 1,
  actualWhenBuggy: 2,
};

export const EXPECTED_LOGICAL_SUBMISSIONS = REGRESSION_CONTRACT.expected;

/**
 * Thrown by the regression test when the logical submission count differs from
 * the expected value. Its message is machine-parseable so the gate can read the
 * structured assertion identity from the raw test report.
 */
export class LogicalSubmissionAssertionError extends Error {
  constructor(
    readonly expected: number,
    readonly actual: number,
  ) {
    super(
      `gate-assertion assertion=${REGRESSION_CONTRACT.assertion} expected=${expected} actual=${actual}`,
    );
    this.name = "LogicalSubmissionAssertionError";
  }
}
