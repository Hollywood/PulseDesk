/**
 * Shape of a ticket record as stored in fixtures/tickets.json and served
 * verbatim by claims-api. The fixture is the single source of truth; the
 * web app reads it over `/api` and does not define its own ticket schema.
 */
export interface Ticket {
  id: string;
  source: "pagerduty" | "sentry";
  severity: string;
  status: string;
  service: string;
  created_at: string;
  title: string;
  summary: string;
  alert_body: string;
  /** Whether Ticketdroid is wired to run RCA + patch + PR for this ticket. */
  wired: boolean;
  notes_for_demo: string;
}

export interface ErrorBody {
  error: {
    code: string;
    message: string;
  };
}

/** A single step of a completed Ticketdroid run, in execution order. */
export interface RunStep {
  id: "intake" | "code_search" | "hypothesis" | "patch";
  title: string;
  detail: string;
  startedAt: number;
  finishedAt: number;
}

/** RCA in the fixed shape of the ticket-analysis skill. */
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
  name: string;
  expected: number;
  actual: number | null;
}

export interface TestRunEvidence {
  total: number;
  passed: number;
  failed: number;
  regression: RegressionAssertionEvidence;
  regressionPassed: boolean;
  certification: "expected_red" | "patched_green";
}

export interface DiffResult {
  path: string;
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

export interface DemoResetResult {
  status: "reset";
  ticketId: string;
  detail: string;
}

/** Full result of one Ticketdroid run, as recorded by claims-api. */
export interface TicketRunResult {
  ticketId: string;
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
