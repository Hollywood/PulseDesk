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
  /** Whether PulseDesk has a deterministic local RCA and patch workflow for this ticket. */
  wired: boolean;
  notes_for_demo: string;
}

export interface ErrorBody {
  error: {
    code: string;
    message: string;
  };
}

/** A single step of a completed PulseDesk run, in execution order. */
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

/** One recommended CI action, catered to the bug this run fixed. */
export interface CiCheck {
  /** Action verb, e.g. "Run" or "Create". */
  action: string;
  /** Command to run, when the action is a command; omitted for prose actions. */
  command?: string;
  /** Why this action guards the bug this run fixed. */
  reason: string;
}

/**
 * Live progress from an in-flight analysis, streamed by claims-api while
 * the run is still working. Demo telemetry only: the recorded run result stays
 * the source of truth for evidence.
 */
export type RunEvent =
  | {
      kind: "session";
      at: number;
      sessionId: string;
      /** Browser URL for an optional external agent session. */
      sessionUrl: string;
    }
  | { kind: "activity"; at: number; tool: string; detail: string }
  | { kind: "thinking"; at: number; text: string }
  | { kind: "message"; at: number; text: string }
  | { kind: "finished"; at: number; ok: boolean; detail: string };

export interface DemoResetResult {
  status: "reset";
  ticketId: string;
  detail: string;
}

/** Full result of one PulseDesk run, as recorded by claims-api. */
export interface TicketRunResult {
  ticketId: string;
  /** Local-only branch created for this run; never pushed by PulseDesk. */
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
  /**
   * CI actions recommended for the bug this run fixed. Optional so a recorded
   * run from before this field existed
   * still renders.
   */
  ciChecks?: CiCheck[];
}
