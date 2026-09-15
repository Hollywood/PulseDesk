import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Express } from "express";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { REGRESSION_CONTRACT } from "../gate/contract.js";
import type { WorkspaceState } from "../gate/certify.js";
import { clearRunEvents, runEvents } from "../run/events.js";
import { RunError, type TicketRunResult } from "../run/types.js";
import { createApp, defaultDeps, type AppDeps } from "./app.js";

const fixtureFile = fileURLToPath(new URL("../../../fixtures/tickets.json", import.meta.url));
const fixture = JSON.parse(readFileSync(fixtureFile, "utf8")) as Array<Record<string, unknown>>;

interface Running {
  server: Server;
  base: string;
}

function start(app: Express): Promise<Running> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

function stop(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

interface StatusBody {
  workspace: string;
  gate: string;
  regression: string;
  reviewReady: boolean;
  mutationAllowed: boolean;
}

const FORBIDDEN = ["/Users/", "at Object.", "Error:", "node:internal", "root:x:", ".ts:"];

function assertNoDisclosure(raw: string): void {
  for (const needle of FORBIDDEN) {
    expect(raw.includes(needle)).toBe(false);
  }
}

describe("claims-api http foundation", () => {
  let running: Running;

  beforeAll(async () => {
    running = await start(createApp());
  });

  afterAll(async () => {
    await stop(running.server);
  });

  it("health returns bounded ok JSON", async () => {
    const res = await fetch(`${running.base}/api/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("x-powered-by")).toBeNull();
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("ticket collection deeply equals the immutable fixture", async () => {
    const res = await fetch(`${running.base}/api/tickets`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(fixture);
  });

  it("each ticket detail exactly equals its fixture record", async () => {
    for (const ticket of fixture) {
      const id = ticket.id as string;
      const res = await fetch(`${running.base}/api/tickets/${id}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(ticket);
    }
  });

  it("unknown ticket id fails safely with bounded JSON", async () => {
    const res = await fetch(`${running.base}/api/tickets/TICKET-0000`);
    expect(res.status).toBe(404);
    const raw = await res.text();
    assertNoDisclosure(raw);
    expect(JSON.parse(raw)).toEqual({
      error: { code: "ticket_not_found", message: expect.any(String) },
    });
  });

  it("traversal-shaped ticket id does not disclose filesystem content", async () => {
    const res = await fetch(`${running.base}/api/tickets/..%2f..%2f..%2fetc%2fpasswd`);
    expect([400, 404]).toContain(res.status);
    const raw = await res.text();
    assertNoDisclosure(raw);
    expect(raw.includes("root:")).toBe(false);
  });

  it("unknown route returns bounded not-found JSON", async () => {
    const res = await fetch(`${running.base}/api/does-not-exist`);
    expect(res.status).toBe(404);
    const raw = await res.text();
    assertNoDisclosure(raw);
    expect(JSON.parse(raw).error.code).toBe("not_found");
  });

  it("demo status reports authoritative buggy classification", async () => {
    const app = createApp({
      getTickets: defaultDeps().getTickets,
      getWorkspaceState: () => "buggy",
      startRun: defaultDeps().startRun,
      getRun: defaultDeps().getRun,
    });
    const running = await start(app);
    try {
      const res = await fetch(`${running.base}/api/demo/status`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as StatusBody;
      expect(body.workspace).toBe("buggy");
      expect(body.gate).toBe("expected_red");
      expect(body.regression).toBe(REGRESSION_CONTRACT.fullName);
      expect(body.reviewReady).toBe(false);
    } finally {
      await stop(running.server);
    }
  });
});

describe("ticket run endpoints", () => {
  const runResult: TicketRunResult = {
    ticketId: "TICKET-1042",
    status: "complete",
    startedAt: 1_000,
    finishedAt: 2_000,
    workspaceBefore: "buggy",
    workspaceAfter: "patched",
    steps: [
      { id: "intake", title: "Intake", detail: "Read the ticket fixture: TICKET-1042.", startedAt: 1_000, finishedAt: 1_100 },
      { id: "code_search", title: "Code search", detail: "Found the active binding.", startedAt: 1_100, finishedAt: 1_200 },
      { id: "hypothesis", title: "Hypothesis", detail: "Baseline red: expected 1, actual 2.", startedAt: 1_200, finishedAt: 1_300 },
      { id: "patch", title: "Patch", detail: "Applied the fix; suite green.", startedAt: 1_300, finishedAt: 2_000 },
    ],
    rca: {
      signal: "pagerduty SEV-2 on claims-api: duplicate claim submission.",
      customerImpact: "Revenue-cycle impact only.",
      hypothesis: "Retry sends a new idempotency key per attempt.",
      filesToInspect: ["claims-api/src/domain/active-strategy.ts"],
      blastRadius: "Retry path only.",
      testsThatMustPass: ["TICKET-1042 duplicate claim submission regression"],
      humanVerification: ["Diff contains only the binding change."],
    },
    testsBefore: {
      total: 5,
      passed: 4,
      failed: 1,
      regression: { name: "logical_submission_count", expected: 1, actual: 2 },
      regressionPassed: false,
      certification: "expected_red",
    },
    testsAfter: {
      total: 5,
      passed: 5,
      failed: 0,
      regression: { name: "logical_submission_count", expected: 1, actual: null },
      regressionPassed: true,
      certification: "patched_green",
    },
    diff: {
      path: "claims-api/src/domain/active-strategy.ts",
      text: "diff --git a/claims-api/src/domain/active-strategy.ts b/claims-api/src/domain/active-strategy.ts\n-import { perAttemptStrategy } from \"./idempotency.js\";\n+import { stableClaimStrategy } from \"./idempotency.js\";",
      added: 2,
      removed: 2,
    },
    pr: {
      title: "fix(claims-api): reuse a stable idempotency key (TICKET-1042)",
      why: "TICKET-1042 duplicate claim submission.",
      whatChanged: ["Flip the production idempotency binding."],
      tests: ["Regression red before, green after."],
      riskAndRollback: "Low. Flip back to roll back.",
      humanVerification: ["Human approval required before merge."],
    },
  };

  function appWithRun(startRun: AppDeps["startRun"], getRun: AppDeps["getRun"]): Express {
    return createApp({
      getTickets: defaultDeps().getTickets,
      getWorkspaceState: defaultDeps().getWorkspaceState,
      startRun,
      getRun,
    });
  }

  it("POST runs the wired ticket and returns the run result", async () => {
    const startRun = vi.fn(async () => runResult);
    const running = await start(appWithRun(startRun, () => null));
    try {
      const res = await fetch(`${running.base}/api/tickets/TICKET-1042/run`, { method: "POST" });
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual(runResult);
      expect(startRun).toHaveBeenCalledWith("TICKET-1042");
    } finally {
      await stop(running.server);
    }
  });

  it("POST refuses a nonexistent ticket", async () => {
    const startRun = vi.fn(async () => runResult);
    const running = await start(appWithRun(startRun, () => null));
    try {
      const res = await fetch(`${running.base}/api/tickets/TICKET-0000/run`, { method: "POST" });
      expect(res.status).toBe(404);
      const raw = await res.text();
      assertNoDisclosure(raw);
      expect(JSON.parse(raw).error.code).toBe("ticket_not_found");
      expect(startRun).not.toHaveBeenCalled();
    } finally {
      await stop(running.server);
    }
  });

  it("POST surfaces bounded 409 conflicts from the run with no disclosure", async () => {
    const startRun = vi.fn(async () => {
      throw new RunError("already_patched", "Workspace is already patched; run the demo reset before a new run.");
    });
    const running = await start(appWithRun(startRun, () => null));
    try {
      const res = await fetch(`${running.base}/api/tickets/TICKET-1042/run`, { method: "POST" });
      expect(res.status).toBe(409);
      const raw = await res.text();
      assertNoDisclosure(raw);
      expect(JSON.parse(raw)).toEqual({ error: { code: "already_patched", message: expect.any(String) } });
    } finally {
      await stop(running.server);
    }
  });

  it("POST maps unexpected run failures to bounded 500 errors", async () => {
    const startRun = vi.fn(async () => {
      throw new Error("boom at /Users/secret/path.ts:12");
    });
    const running = await start(appWithRun(startRun, () => null));
    try {
      const res = await fetch(`${running.base}/api/tickets/TICKET-1042/run`, { method: "POST" });
      expect(res.status).toBe(500);
      const raw = await res.text();
      assertNoDisclosure(raw);
      expect(JSON.parse(raw).error.code).toBe("run_failed");
    } finally {
      await stop(running.server);
    }
  });

  it("GET returns the recorded run for the ticket", async () => {
    const running = await start(appWithRun(async () => runResult, () => runResult));
    try {
      const res = await fetch(`${running.base}/api/tickets/TICKET-1042/run`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(runResult);
    } finally {
      await stop(running.server);
    }
  });

  it("GET returns 404 when no run has been recorded", async () => {
    const running = await start(appWithRun(async () => runResult, () => null));
    try {
      const res = await fetch(`${running.base}/api/tickets/TICKET-1042/run`);
      expect(res.status).toBe(404);
      expect(JSON.parse(await res.text()).error.code).toBe("no_run_found");
    } finally {
      await stop(running.server);
    }
  });

  it("POST resets the demo through the injected demo-reset workflow", async () => {
    const resetDemo = vi.fn(() => ({
      status: "reset" as const,
      ticketId: "TICKET-1042" as const,
      detail: "Planted TICKET-1042 bug restored; ready for a new run.",
    }));
    const running = await start(
      createApp({
        getTickets: defaultDeps().getTickets,
        getWorkspaceState: defaultDeps().getWorkspaceState,
        startRun: async () => runResult,
        getRun: () => null,
        resetDemo,
      }),
    );
    try {
      const res = await fetch(`${running.base}/api/demo/reset`, { method: "POST" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        status: "reset",
        ticketId: "TICKET-1042",
        detail: "Planted TICKET-1042 bug restored; ready for a new run.",
      });
      expect(resetDemo).toHaveBeenCalledOnce();
    } finally {
      await stop(running.server);
    }
  });
});

describe("read endpoints remain available in blocked states", () => {
  for (const state of ["dirty", "unknown"] as WorkspaceState[]) {
    it(`serves health, tickets, and blocked demo status when ${state}`, async () => {
      const app = createApp({
        getTickets: defaultDeps().getTickets,
        getWorkspaceState: () => state,
        startRun: defaultDeps().startRun,
        getRun: defaultDeps().getRun,
      });
      const running = await start(app);
      try {
        const health = await fetch(`${running.base}/api/health`);
        expect(await health.json()).toEqual({ status: "ok" });

        const tickets = await fetch(`${running.base}/api/tickets`);
        expect(await tickets.json()).toEqual(fixture);

        const statusRes = await fetch(`${running.base}/api/demo/status`);
        expect(statusRes.status).toBe(200);
        const raw = await statusRes.text();
        assertNoDisclosure(raw);
        const body = JSON.parse(raw) as StatusBody;
        expect(body.workspace).toBe(state);
        expect(body.gate).toBe("blocked");
        expect(body.mutationAllowed).toBe(false);
      } finally {
        await stop(running.server);
      }
    });
  }
});

describe("live run events", () => {
  function appForEvents(): Express {
    return createApp({
      getTickets: defaultDeps().getTickets,
      getWorkspaceState: defaultDeps().getWorkspaceState,
      startRun: async () => {
        throw new RunError("factory_unavailable", "not used in this test");
      },
      getRun: () => null,
    });
  }

  afterEach(() => {
    clearRunEvents();
  });

  it("streams progress while a run is in flight and closes when it ends", async () => {
    const running = await start(appForEvents());
    try {
      const stream = runEvents("TICKET-1042");
      stream.begin();
      const res = await fetch(`${running.base}/api/tickets/TICKET-1042/run/events`);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");

      stream.publish({ kind: "activity", at: 1, tool: "Grep", detail: "idempotency" });
      stream.publish({ kind: "thinking", at: 2, text: "Checking the retry path" });
      stream.end(true, "Run complete.", 3);

      const body = await res.text();
      expect(body).toContain('"tool":"Grep"');
      expect(body).toContain('"text":"Checking the retry path"');
      expect(body).toContain('"kind":"finished"');
      assertNoDisclosure(body);
    } finally {
      await stop(running.server);
    }
  });

  it("replays a finished run's events and closes instead of hanging when nothing is running", async () => {
    const running = await start(appForEvents());
    try {
      const stream = runEvents("TICKET-1029");
      stream.begin();
      stream.publish({
        kind: "session",
        at: 1,
        sessionId: "5fcc2798-d0da",
        sessionUrl: "factory-desktop://sessions/5fcc2798-d0da",
      });
      stream.end(true, "Run complete.", 2);

      const body = await (await fetch(`${running.base}/api/tickets/TICKET-1029/run/events`)).text();
      expect(body).toContain('"sessionId":"5fcc2798-d0da"');
      expect(body).toContain('"sessionUrl":"factory-desktop://sessions/5fcc2798-d0da"');
      expect(body).toContain('"kind":"finished"');
    } finally {
      await stop(running.server);
    }
  });

  it("refuses an unknown ticket with a bounded error", async () => {
    const running = await start(appForEvents());
    try {
      const res = await fetch(`${running.base}/api/tickets/TICKET-0000/run/events`);
      expect(res.status).toBe(404);
      const raw = await res.text();
      expect(JSON.parse(raw)).toEqual({
        error: { code: "ticket_not_found", message: "No ticket exists with the requested id." },
      });
      assertNoDisclosure(raw);
    } finally {
      await stop(running.server);
    }
  });
});
