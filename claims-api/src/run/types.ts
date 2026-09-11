/**
 * Structured output of a Ticketdroid run. All fields are derived from real
 * run-time evidence (fixture content, actual files searched, actual test
 * results, the real applied patch, and a genuine git diff) — nothing is
 * pre-written demo copy.
 */

export type RunStepId = "intake" | "code_search" | "hypothesis" | "patch";

export interface RunStep {
  id: RunStepId;
  /** Short headline, e.g. "Intake". */
  title: string;
  /** What actually happened in this step, with evidence. */
  detail: string;
  /** Epoch milliseconds when the step began. */
  startedAt: number;
  /** Epoch milliseconds when the step finished. */
  finishedAt: number;
}

/**
 * Root-cause analysis in the exact fixed shape of the `ticket-analysis` skill
 * (Signal, Customer impact, Hypothesis, Files to inspect, Blast radius, Tests
 * that must pass, What a human must verify before merge).
 */
export interface RcaDocument {
  signal: string;
  customerImpact: string;
  hypothesis: string;
  filesToInspect: string[];
  blastRadius: string;
  testsThatMustPass: string[];
  humanVerification: string[];
}

export interface RegressionAssertionEvidence {
  /** Machine assertion name, e.g. `logical_submission_count`. */
  name: string;
  expected: number;
  /** Actual measured value; null when the regression passed. */
  actual: number | null;
}

export interface TestRunEvidence {
  total: number;
  passed: number;
  failed: number;
  regression: RegressionAssertionEvidence;
  regressionPassed: boolean;
  /** Workspace certification derived from the raw suite by the gate. */
  certification: "expected_red" | "patched_green";
}

export interface DiffResult {
  /** Repo-relative path of the patched file. */
  path: string;
  /** Real unified diff produced by git against the pre-patch baseline. */
  text: string;
  added: number;
  removed: number;
}

export interface PrSummary {
  title: string;
  why: string;
  whatChanged: string[];
  tests: string[];
  riskAndRollback: string;
  humanVerification: string[];
}

export interface TicketRunResult {
  ticketId: string;
  /** Local-only branch created for this run; never pushed by Ticketdroid. */
  branchName?: string;
  status: "complete";
  startedAt: number;
  finishedAt: number;
  workspaceBefore: "buggy";
  workspaceAfter: "patched";
  steps: RunStep[];
  rca: RcaDocument;
  testsBefore: TestRunEvidence;
  testsAfter: TestRunEvidence;
  diff: DiffResult;
  pr: PrSummary;
}

/** Bounded run failure surfaced as a JSON error, never a stack trace. */
export class RunError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RunError";
  }
}
