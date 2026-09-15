import { describe, expect, it, vi } from "vitest";
import type { GateRunResult } from "../gate/certify.js";
import { REGRESSION_CONTRACT } from "../gate/contract.js";
import { createDefaultOrchestrateDeps, runTicket, type OrchestrateDeps } from "./orchestrate.js";
import { derivePatchedSource } from "./patch.js";
import { RunError } from "./types.js";

const BASELINE = [
  'import type { IdempotencyStrategy } from "./idempotency.js";',
  'import { perAttemptStrategy } from "./idempotency.js";',
  "",
  "export const ACTIVE_STRATEGY: IdempotencyStrategy = perAttemptStrategy;",
  "",
].join("\n");

const TICKET = {
  id: "TICKET-1042",
  source: "pagerduty",
  severity: "SEV-2",
  status: "triggered",
  service: "claims-api",
  created_at: "2026-09-10T05:14:00Z",
  title: "Duplicate claim submission detected — claims-api",
  summary: "Payer clearinghouse rejected claim CLM-2381 as a duplicate.",
  alert_body: "Monitor: claims-submission-duplicate-check\nClaim ID: CLM-2381\nClearinghouse response: 277CA duplicate-claim flag, ref DUP-88213",
  wired: true,
  notes_for_demo: "",
};

function greenRun(): GateRunResult {
  return {
    spawn: "ok",
    timedOut: false,
    signal: null,
    exitCode: 0,
    report: {
      startTime: Date.now(),
      numTotalTests: 5,
      numPassedTests: 5,
      numFailedTests: 0,
      numPendingTests: 0,
      numTodoTests: 0,
      suiteErrors: [],
      assertions: [{ fullName: REGRESSION_CONTRACT.fullName, status: "passed", failures: [] }],
    },
    reportError: null,
  };
}

function redRun(actual: number): GateRunResult {
  return {
    spawn: "ok",
    timedOut: false,
    signal: null,
    exitCode: 1,
    report: {
      startTime: Date.now(),
      numTotalTests: 5,
      numPassedTests: 4,
      numFailedTests: 1,
      numPendingTests: 0,
      numTodoTests: 0,
      suiteErrors: [],
      assertions: [
        {
          fullName: REGRESSION_CONTRACT.fullName,
          status: "failed",
          failures: [
            { assertion: "logical_submission_count", expected: 1, actual },
          ],
        },
      ],
    },
    reportError: null,
  };
}

function baseDeps(overrides: Partial<OrchestrateDeps> = {}) {
  return createDefaultOrchestrateDeps({
    getTicket: (id: string) => (id === "TICKET-1042" ? TICKET : undefined),
    workspaceState: () => "buggy",
    runSuite: async () => greenRun(),
    readPatchTarget: () => BASELINE,
    readIdempotencySource: () => 'return `${request.claimId}:attempt-${attemptNumber}`;',
    writePatchTarget: () => undefined,
    ...overrides,
  });
}

describe("runTicket happy path", () => {
  it("records the four truthful steps, RCA, test flip, real diff, and PR", async () => {
    const writePatch = vi.fn();
    const onPatchApplied = vi.fn();
    const runSuite = vi
      .fn()
      .mockResolvedValueOnce(redRun(2))
      .mockResolvedValueOnce(greenRun());

    const deps = baseDeps({
      runSuite,
      writePatchTarget: writePatch,
      onPatchApplied,
      branchName: "ticketdroid/TICKET-1042",
    });

    const result = await runTicket("TICKET-1042", deps);

    expect(result.ticketId).toBe("TICKET-1042");
    expect(result.branchName).toBe("ticketdroid/TICKET-1042");
    expect(result.status).toBe("complete");
    expect(result.workspaceBefore).toBe("buggy");
    expect(result.workspaceAfter).toBe("patched");
    expect(result.finishedAt).toBeGreaterThanOrEqual(result.startedAt);

    expect(result.steps.map((s) => s.id)).toEqual(["intake", "code_search", "hypothesis", "patch"]);
    expect(result.steps.map((s) => s.title)).toEqual(["Intake", "Code search", "Hypothesis", "Patch"]);
    for (const stepResult of result.steps) {
      expect(stepResult.finishedAt).toBeGreaterThanOrEqual(stepResult.startedAt);
      expect(stepResult.detail.length).toBeGreaterThan(0);
    }

    expect(result.steps[0].detail).toContain("TICKET-1042");
    expect(result.steps[1].detail).toContain("claims-api/src/domain/active-strategy.ts");
    expect(result.steps[1].detail).toContain("perAttemptStrategy");
    expect(result.steps[2].detail).toContain("expected 1, actual 2");
    expect(result.steps[3].detail).toContain("stableClaimStrategy");
    expect(result.steps[3].detail).toContain("2 added, 2 removed");

    expect(result.testsBefore.regressionPassed).toBe(false);
    expect(result.testsBefore.regression).toMatchObject({ name: "logical_submission_count", expected: 1, actual: 2 });
    expect(result.testsBefore.failed).toBe(1);
    expect(result.testsAfter.regressionPassed).toBe(true);
    expect(result.testsAfter.regression.actual).toBeNull();
    expect(result.testsAfter.failed).toBe(0);

    expect(result.rca.signal).toContain("Duplicate claim submission");
    expect(result.rca.customerImpact).toContain("CLM-2381");
    expect(result.rca.hypothesis).toContain("perAttemptStrategy");
    expect(result.rca.hypothesis).toContain("stable");
    expect(result.rca.filesToInspect).toContain("claims-api/src/domain/active-strategy.ts");
    expect(result.rca.humanVerification.length).toBeGreaterThan(0);

    expect(result.diff.text).toContain("+export const ACTIVE_STRATEGY: IdempotencyStrategy = stableClaimStrategy;");
    expect(result.diff.added).toBe(2);
    expect(result.diff.removed).toBe(2);

    expect(result.pr.title).toContain("TICKET-1042");
    expect(result.pr.why).toContain("TICKET-1042");
    expect(result.pr.humanVerification.length).toBeGreaterThan(0);

    expect(result.ciChecks.length).toBeGreaterThan(0);
    expect(result.ciChecks[0].command).toBe("pnpm --dir claims-api test");
    expect(result.ciChecks[0].reason).toContain("logical_submission_count");

    expect(writePatch).toHaveBeenCalledTimes(1);
    expect(writePatch.mock.calls[0][0]).toContain("stableClaimStrategy");
    expect(runSuite).toHaveBeenCalledTimes(2);
    expect(onPatchApplied).toHaveBeenCalledWith(BASELINE, expect.stringContaining("stableClaimStrategy"));
  });
});

describe("runTicket guards", () => {
  it("refuses a missing ticket without touching the workspace", async () => {
    const writePatch = vi.fn();
    const deps = baseDeps({ writePatchTarget: writePatch });
    await expect(runTicket("TICKET-0000", deps)).rejects.toMatchObject({ code: "ticket_not_found" });
    expect(writePatch).not.toHaveBeenCalled();
  });

  it("refuses an unwired ticket", async () => {
    const unwired = { ...TICKET, wired: false };
    const deps = baseDeps({ getTicket: () => unwired });
    await expect(runTicket("TICKET-1042", deps)).rejects.toMatchObject({ code: "ticket_not_wired" });
  });

  it("refuses when the workspace is already patched", async () => {
    const runSuite = vi.fn();
    const deps = baseDeps({ workspaceState: () => "patched", runSuite });
    await expect(runTicket("TICKET-1042", deps)).rejects.toMatchObject({ code: "already_patched" });
    expect(runSuite).not.toHaveBeenCalled();
  });

  it("aborts without mutating when the baseline suite is not the planted red", async () => {
    const writePatch = vi.fn();
    const deps = baseDeps({
      runSuite: async () => redRun(5),
      writePatchTarget: writePatch,
    });
    await expect(runTicket("TICKET-1042", deps)).rejects.toMatchObject({ code: "run_guard_failed" });
    expect(writePatch).not.toHaveBeenCalled();
  });

  it("rolls the patch back verbatim when the post-patch suite is not green", async () => {
    const targets: string[] = [];
    const deps = baseDeps({
      runSuite: vi
        .fn()
        .mockResolvedValueOnce(redRun(2))
        .mockResolvedValueOnce(redRun(2)),
      writePatchTarget: (content: string) => {
        targets.push(content);
      },
    });
    await expect(runTicket("TICKET-1042", deps)).rejects.toMatchObject({ code: "patch_rollback" });
    expect(targets).toHaveLength(2);
    expect(targets[1]).toBe(BASELINE);
    expect(targets[0]).toBe(derivePatchedSource(BASELINE));
  });
});
