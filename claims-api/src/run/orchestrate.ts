import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { WorkspaceState, GateRunResult, GateDecision } from "../gate/certify.js";
import { certifyGate } from "../gate/certify.js";
import { REGRESSION_CONTRACT } from "../gate/contract.js";
import { activeStrategyPath, claimsApiRoot, runRawClaimsTests } from "../gate/run-tests.js";
import { resolveWorkspaceState } from "../gate/state.js";
import { loadTickets } from "../http/tickets.js";
import { computeRealDiff } from "./diff.js";
import { derivePatchedSource, readActiveStrategySource } from "./patch.js";
import { buildCiChecks, buildPrSummary } from "./pr.js";
import { buildRca, toTestEvidence } from "./rca.js";
import { RunError, type DiffResult, type RunStep, type TicketRunResult } from "./types.js";

/** Repo-relative path of the single file the TICKET-1042 patch changes. */
export const PATCH_RELATIVE_PATH = "claims-api/src/domain/active-strategy.ts";

export const CODE_SEARCH_FILES = [
  PATCH_RELATIVE_PATH,
  "claims-api/src/domain/idempotency.ts",
  "claims-api/src/domain/claims-submission.ts",
  "claims-api/src/domain/clearinghouse.ts",
  "claims-api/src/regression.test.ts",
];

const ACTIVE_BINDING_PATTERN = /export const ACTIVE_STRATEGY:[^=]+=\s*(\w+);/;

export interface OrchestrateDeps {
  /** Name of the local branch created for this run, when running the app. */
  branchName?: string;
  /** Reads the ticket fixture record for an id. */
  getTicket: (id: string) => Record<string, unknown> | undefined;
  /** Classifies the workspace (buggy / patched / dirty / unknown). */
  workspaceState: () => WorkspaceState;
  /** Runs the raw claims suite in a child process and returns the report. */
  runSuite: () => Promise<GateRunResult>;
  /** Certifies a workspace state against a fresh suite report. */
  certify: (state: WorkspaceState, run: GateRunResult) => GateDecision;
  /** Reads the current active-strategy source from disk. */
  readPatchTarget: () => string;
  /** Reads the idempotency module source (searched for the key template). */
  readIdempotencySource: () => string;
  /** Writes the patched active-strategy source to disk. */
  writePatchTarget: (content: string) => void;
  /** Computes the genuine diff between baseline and patched sources. */
  computeDiff: (baseline: string, patched: string) => DiffResult;
  /** Called only after the patch is certified green (persists the snapshot). */
  onPatchApplied?: (baseline: string, patched: string) => void;
  now: () => number;
}

const TEST_TIMEOUT_MS = 120_000;
const STALE_THRESHOLD_MS = 600_000;

function idempotencySourcePath(): string {
  return fileURLToPath(new URL("../domain/idempotency.ts", import.meta.url));
}

/** Production dependencies: real filesystem, real suite, real git diff. */
export function createDefaultOrchestrateDeps(overrides: Partial<OrchestrateDeps> = {}): OrchestrateDeps {
  const base: OrchestrateDeps = {
    getTicket: (id) => loadTickets().find((entry) => entry.id === id),
    workspaceState: () => resolveWorkspaceState(activeStrategyPath()),
    runSuite: () => runRawClaimsTests({ cwd: claimsApiRoot(), timeoutMs: TEST_TIMEOUT_MS }),
    certify: (state, run) =>
      certifyGate(state, run, REGRESSION_CONTRACT, { now: Date.now(), staleThresholdMs: STALE_THRESHOLD_MS }),
    readPatchTarget: () => readActiveStrategySource(activeStrategyPath()),
    readIdempotencySource: () => readActiveStrategySource(idempotencySourcePath()),
    writePatchTarget: (content) => writeFileSync(activeStrategyPath(), content, "utf8"),
    computeDiff: (baseline, patched) => computeRealDiff(baseline, patched, PATCH_RELATIVE_PATH),
    now: () => Date.now(),
  };
  return { ...base, ...overrides };
}

interface CodeSearchResult {
  filesFound: string[];
  activeBinding: string;
  derivesPerAttemptKey: boolean;
}

/**
 * Searches claims-api/src for the submission path, idempotency binding, and
 * regression. Reads through the injected deps so the recorded evidence always
 * matches the same sources the run actually acts on.
 */
function searchClaimsApi(deps: OrchestrateDeps): CodeSearchResult {
  const filesFound = CODE_SEARCH_FILES.filter((file) =>
    existsSync(new URL(`../../../${file}`, import.meta.url)),
  );
  const activeBinding = ACTIVE_BINDING_PATTERN.exec(deps.readPatchTarget())?.[1] ?? "unknown";
  const derivesPerAttemptKey = deps.readIdempotencySource().includes(":attempt-");
  return { filesFound, activeBinding, derivesPerAttemptKey };
}

function step(stepId: RunStep["id"], title: string, detail: string, startedAt: number, now: () => number): RunStep {
  return { id: stepId, title, detail, startedAt, finishedAt: now() };
}

const WIRING_ERRORS: Record<Exclude<WorkspaceState, "buggy">, { code: string; message: string }> = {
  patched: {
    code: "already_patched",
    message: "Workspace is already patched; run the demo reset before a new run.",
  },
  dirty: {
    code: "workspace_blocked",
    message: "Workspace has unexpected local edits and cannot run until restored.",
  },
  unknown: {
    code: "workspace_blocked",
    message: "Workspace state could not be verified and cannot run until restored.",
  },
};

/**
 * Executes one truthful PulseDesk run for a ticket: intake, code search,
 * baseline tests (expected red), hypothesis/RCA, the real patch, post-patch
 * tests (green), and the genuine diff. Every step is recorded in order with
 * real evidence and timestamps. The patch is rolled back verbatim if the
 * post-patch suite does not certify green.
 */
export async function runTicket(ticketId: string, deps: OrchestrateDeps): Promise<TicketRunResult> {
  const ticket = deps.getTicket(ticketId);
  if (ticket === undefined) {
    throw new RunError("ticket_not_found", "No ticket exists with the requested id.");
  }
  if (ticket.wired !== true) {
    throw new RunError("ticket_not_wired", "Read-only signal — no automated run for this ticket.");
  }

  const stateBefore = deps.workspaceState();
  if (stateBefore === "patched" || stateBefore === "dirty" || stateBefore === "unknown") {
    const error = WIRING_ERRORS[stateBefore];
    throw new RunError(error.code, error.message);
  }

  const startedAt = deps.now();
  const steps: RunStep[] = [];

  // 1. Intake — the fixture record itself.
  const intakeAt = deps.now();
  const id = typeof ticket.id === "string" ? ticket.id : ticketId;
  const severity = typeof ticket.severity === "string" ? ticket.severity : "";
  const source = typeof ticket.source === "string" ? ticket.source : "";
  const service = typeof ticket.service === "string" ? ticket.service : "";
  const title = typeof ticket.title === "string" ? ticket.title : "";
  const summary = typeof ticket.summary === "string" ? ticket.summary : "";
  steps.push(
    step(
      "intake",
      "Intake",
      `Read the ticket fixture: ${id} (${source}, ${severity}, service ${service}) — ${title}. ${summary}`,
      intakeAt,
      deps.now,
    ),
  );

  // 2. Code search — files actually present, and the binding actually read.
  const searchAt = deps.now();
  const search = searchClaimsApi(deps);
  const bindingNote = search.derivesPerAttemptKey
    ? `derives a key per attempt (${PATCH_RELATIVE_PATH.replace("active-strategy.ts", "idempotency.ts")} has the :attempt- template)`
    : `does not derive a per-attempt key`;
  steps.push(
    step(
      "code_search",
      "Code search",
      `Scanned claims-api/src: found ${search.filesFound.join(", ")}. The production binding in ` +
        `${PATCH_RELATIVE_PATH} is ACTIVE_STRATEGY = ${search.activeBinding}; idempotency ${bindingNote}. ` +
        `The planted regression lives in claims-api/src/regression.test.ts.`,
      searchAt,
      deps.now,
    ),
  );

  // 3. Hypothesis — baseline suite must certify expected red, then write the RCA.
  const hypothesisAt = deps.now();
  const beforeRun = await deps.runSuite();
  const beforeDecision = deps.certify("buggy", beforeRun);
  if (!beforeDecision.ok) {
    throw new RunError("run_guard_failed", beforeDecision.reason);
  }
  const testsBefore = toTestEvidence(beforeRun);
  const rca = buildRca({
    ticket,
    filesFound: search.filesFound,
    activeBinding: search.activeBinding,
    derivesPerAttemptKey: search.derivesPerAttemptKey,
    testsBefore,
  });
  const actual = testsBefore.regression.actual;
  steps.push(
    step(
      "hypothesis",
      "Hypothesis",
      `Baseline suite certified expected_red: ${testsBefore.failed} failing test — ` +
        `${testsBefore.regression.name} expected ${testsBefore.regression.expected}, actual ${actual}. ` +
        `Hypothesis: the retry sends a new idempotency key per attempt, so the clearinghouse records two ` +
        `logical submissions; the fix is the stable claim-scoped key already defined in the domain module.`,
      hypothesisAt,
      deps.now,
    ),
  );

  // 4. Patch — apply the real fix, certify green, roll back verbatim on failure.
  const patchAt = deps.now();
  const baseline = deps.readPatchTarget();
  const patched = derivePatchedSource(baseline);
  deps.writePatchTarget(patched);

  const afterRun = await deps.runSuite();
  const afterDecision = deps.certify("patched", afterRun);
  if (!afterDecision.ok) {
    deps.writePatchTarget(baseline);
    throw new RunError("patch_rollback", afterDecision.reason);
  }
  const testsAfter = toTestEvidence(afterRun);
  const diff = deps.computeDiff(baseline, patched);
  deps.onPatchApplied?.(baseline, patched);
  const pr = buildPrSummary({ ticket, rca, testsAfter, diff });
  const ciChecks = buildCiChecks({ ticket, rca, testsAfter, diff });
  steps.push(
    step(
      "patch",
      "Patch",
      `Applied the real fix: flipped the production binding in ${diff.path} to stableClaimStrategy ` +
        `(${diff.added} added, ${diff.removed} removed lines). Suite certified patched_green: ` +
        `${testsAfter.passed} passed, ${testsAfter.failed} failed (${testsAfter.total} total).`,
      patchAt,
      deps.now,
    ),
  );

  return {
    ticketId: id,
    branchName: deps.branchName,
    status: "complete",
    startedAt,
    finishedAt: deps.now(),
    workspaceBefore: "buggy",
    workspaceAfter: "patched",
    steps,
    rca,
    testsBefore,
    testsAfter,
    diff,
    pr,
    ciChecks,
  };
}
