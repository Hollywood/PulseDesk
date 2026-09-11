import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import type { Ticket, TicketRunResult } from "./types";

const fixture = [
  {
    id: "TICKET-1042",
    source: "pagerduty",
    severity: "SEV-2",
    status: "triggered",
    service: "claims-api",
    created_at: "2026-09-10T05:14:00Z",
    title: "Duplicate claim submission detected — claims-api",
    summary: "Payer clearinghouse rejected claim CLM-2381 as a duplicate.",
    alert_body: "Monitor: claims-submission-duplicate-check\nClaim ID: CLM-2381",
    wired: true,
    notes_for_demo: "",
  },
  {
    id: "TICKET-1038",
    source: "sentry",
    severity: "SEV-3",
    status: "triggered",
    service: "scheduling-api",
    created_at: "2026-09-08T14:02:00Z",
    title: "Intermittent double-booking on appointment reschedule",
    summary: "Two appointment slots created for the same patient/provider pair.",
    alert_body: "Error: SlotConflictWarning (non-fatal)",
    wired: false,
    notes_for_demo: "",
  },
  {
    id: "TICKET-1029",
    source: "pagerduty",
    severity: "SEV-3",
    status: "acknowledged",
    service: "ehr-interface-gateway",
    created_at: "2026-09-06T09:40:00Z",
    title: "HL7 ADT feed lag exceeding 15 min threshold",
    summary: "Outbound ADT messages queuing with rising lag; no failures yet.",
    alert_body: "Monitor: hl7-adt-queue-lag",
    wired: false,
    notes_for_demo: "",
  },
  {
    id: "TICKET-1015",
    source: "sentry",
    severity: "SEV-4",
    status: "resolved",
    service: "claims-api",
    created_at: "2026-09-02T22:10:00Z",
    title: "Nightly claims batch export job ran 40 min longer than baseline",
    summary: "Batch export completed but exceeded the SLA window; no data loss.",
    alert_body: "Job: nightly-claims-export",
    wired: false,
    notes_for_demo: "",
  },
] as const satisfies readonly Ticket[];

const statusBody = {
  workspace: "buggy",
  gate: "expected_red",
  mutationAllowed: true,
  reviewReady: false,
  runState: "idle",
  regression: "claims-api duplicate submission regression",
  detail: "Planted regression is red as expected; ready for a Ticketdroid run.",
};

const runResult: TicketRunResult = {
  ticketId: "TICKET-1042",
  status: "complete",
  startedAt: 1_000,
  finishedAt: 3_000,
  workspaceBefore: "buggy",
  workspaceAfter: "patched",
  steps: [
    { id: "intake", title: "Intake", detail: "Read the ticket fixture: TICKET-1042 (pagerduty, SEV-2).", startedAt: 1_000, finishedAt: 1_200 },
    { id: "code_search", title: "Code search", detail: "Scanned claims-api/src: ACTIVE_STRATEGY = perAttemptStrategy.", startedAt: 1_200, finishedAt: 1_400 },
    { id: "hypothesis", title: "Hypothesis", detail: "Baseline red: logical_submission_count expected 1, actual 2.", startedAt: 1_400, finishedAt: 1_600 },
    { id: "patch", title: "Patch", detail: "Applied the fix: flipped the binding to stableClaimStrategy.", startedAt: 1_600, finishedAt: 3_000 },
  ],
  rca: {
    signal: "pagerduty SEV-2 on claims-api: duplicate claim submission detected.",
    customerImpact: "The payer flagged CLM-2381 as a duplicate; billing/claims impact only.",
    hypothesis: "The retry sends a new idempotency key per attempt, so the clearinghouse records two logical submissions.",
    filesToInspect: ["claims-api/src/domain/active-strategy.ts"],
    blastRadius: "Outbound claim submissions that hit the accepted-then-timeout retry path.",
    testsThatMustPass: ["TICKET-1042 duplicate claim submission regression", "Full claims-api suite green"],
    humanVerification: ["The diff contains only the idempotency binding change."],
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
    text: 'diff --git a/claims-api/src/domain/active-strategy.ts b/claims-api/src/domain/active-strategy.ts\n-import { perAttemptStrategy } from "./idempotency.js";\n+import { stableClaimStrategy } from "./idempotency.js";',
    added: 2,
    removed: 2,
  },
  pr: {
    title: "fix(claims-api): reuse a stable idempotency key across claim-submission retries (TICKET-1042)",
    why: "TICKET-1042 — duplicate claim submission detected.",
    whatChanged: ["Flip the production idempotency binding from per-attempt keys to the stable claim-scoped key."],
    tests: ["TICKET-1042 regression: expected 1 — red before, green after."],
    riskAndRollback: "Low. A single binding change; flip back to roll back.",
    humanVerification: ["Human approval required before merge."],
  },
};

/** Returns a controller that closes over the json payload each route serves. */
function mockRoutes(routes: Record<string, unknown>) {
  const controller = {
    set: (key: string, value: unknown) => {
      routes[key] = value;
    },
  };
  return controller;
}

let routes: Record<string, unknown>;

async function renderApp(hash = "#/") {
  window.location.hash = hash;
  render(<App />);
  await waitFor(() => expect(screen.queryByText("Loading signals…")).not.toBeInTheDocument());
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = typeof input === "string" ? input : input.toString();
      const key = init?.method === "POST" ? `POST ${path}` : path;
      const body = routes[key];
      if (body === undefined) {
        return new Response(JSON.stringify({ error: { code: "not_found", message: "nope" } }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(body), {
        status: key.startsWith("POST ") ? 201 : 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  routes = {
    "/api/tickets": [...fixture],
    "/api/demo/status": statusBody,
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = "";
});

describe("inbox", () => {
  it("renders all four fixture tickets with status, severity, service, and title", async () => {
    await renderApp();

    for (const ticket of fixture) {
      expect(screen.getByText(ticket.id)).toBeInTheDocument();
      expect(screen.getByText(ticket.title)).toBeInTheDocument();
    }

    // Per-row badges (status + severity) and service, for every ticket.
    expect(screen.getAllByTestId("status")).toHaveLength(4);
    expect(screen.getAllByTestId("severity")).toHaveLength(4);
    expect(screen.getAllByText("claims-api")).toHaveLength(2);
    expect(screen.getAllByText("scheduling-api")).toHaveLength(1);
    expect(screen.getAllByText("ehr-interface-gateway")).toHaveLength(1);

    for (const status of ["triggered", "acknowledged", "resolved"]) {
      expect(screen.getAllByText(status).length).toBeGreaterThan(0);
    }
    for (const severity of ["SEV-2", "SEV-3", "SEV-4"]) {
      expect(screen.getAllByText(severity).length).toBeGreaterThan(0);
    }
  });

  it("sorts rows newest-first by created_at", async () => {
    await renderApp();
    const list = screen.getByLabelText("Ticket inbox");
    const tickets = Array.from(list.querySelectorAll(".ticket-id")).map(
      (el) => el.textContent ?? "",
    );
    expect(tickets).toEqual([
      "TICKET-1042",
      "TICKET-1038",
      "TICKET-1029",
      "TICKET-1015",
    ]);
  });
});

describe("detail view", () => {
  it("opens a ticket detail from the inbox (hash routing)", async () => {
    await renderApp();
    await userEvent.click(screen.getByText("Duplicate claim submission detected — claims-api"));

    await waitFor(() => {
      expect(window.location.hash).toBe("#/tickets/TICKET-1042");
    });

    const title = screen.getByRole("heading", { level: 1 });
    expect(title).toHaveTextContent("Duplicate claim submission detected — claims-api");
    expect(screen.getAllByText("TICKET-1042").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Payer clearinghouse rejected claim CLM-2381 as a duplicate."),
    ).toBeInTheDocument();
    expect(screen.getByText(/claims-submission-duplicate-check/)).toBeInTheDocument();
  });

  it("shows a Run Ticketdroid button only for the wired ticket", async () => {
    await renderApp();
    await userEvent.click(screen.getByText("Duplicate claim submission detected — claims-api"));

    await waitFor(() => {
      expect(window.location.hash).toBe("#/tickets/TICKET-1042");
    });
    expect(screen.getByRole("button", { name: "Run Ticketdroid" })).toBeInTheDocument();
  });

  it("marks the three unwired tickets as read-only with no run button", async () => {
    const unwired = fixture.filter((t) => !t.wired);
    for (const ticket of unwired) {
      window.location.hash = `#/tickets/${ticket.id}`;
      const view = render(<App />);
      await waitFor(() => {
        expect(screen.getAllByText(ticket.id).length).toBeGreaterThan(0);
      });
      expect(screen.queryByRole("button", { name: "Run Ticketdroid" })).not.toBeInTheDocument();
      expect(screen.getByText("Read-only signal — no automated run for this ticket.")).toBeInTheDocument();
      view.unmount();
    }
  });

  it("starts a run via POST and renders the timeline, RCA, test flip, real diff, and PR", async () => {
    routes["POST /api/tickets/TICKET-1042/run"] = runResult;
    const fetchMock = vi.mocked(globalThis.fetch);
    await renderApp();
    await userEvent.click(screen.getByText("Duplicate claim submission detected — claims-api"));
    await waitFor(() => {
      expect(window.location.hash).toBe("#/tickets/TICKET-1042");
    });

    await userEvent.click(screen.getByRole("button", { name: "Run Ticketdroid" }));

    const runCalls = fetchMock.mock.calls.filter(([input, init]) =>
      String(input).startsWith("/api/tickets/TICKET-1042/run") && init?.method === "POST",
    );
    await waitFor(() => {
      expect(runCalls.length).toBeGreaterThan(0);
    });

    // Timeline: the honest four steps.
    expect(await screen.findByText("Run complete")).toBeInTheDocument();
    const timeline = within(screen.getByLabelText("Run timeline"));
    for (const title of ["Intake", "Code search", "Hypothesis", "Patch"]) {
      expect(timeline.getByText(title)).toBeInTheDocument();
    }
    await waitFor(() => {
      expect(screen.getByText(/Baseline red: logical_submission_count expected 1, actual 2/)).toBeInTheDocument();
    });

    // RCA fixed shape.
    const signal = screen.getByText(/pagerduty SEV-2 on claims-api/);
    expect(signal).toBeInTheDocument();
    expect(screen.getByText("Customer impact")).toBeInTheDocument();
    expect(screen.getByText("What a human must verify before merge")).toBeInTheDocument();

    // Test flip and real diff.
    expect(screen.getByText(/4 passed \/ 1 failed \/ 5 total/)).toBeInTheDocument();
    expect(screen.getByText(/5 passed \/ 0 failed \/ 5 total/)).toBeInTheDocument();
    expect(screen.getByTestId("diff").textContent).toContain("+import { stableClaimStrategy } from \"./idempotency.js\";");
    expect(screen.getByTestId("diff").textContent).toContain("diff --git a/claims-api/src/domain/active-strategy.ts");

    // PR summary with the human-approval gate.
    expect(screen.getByText(/reuse a stable idempotency key/)).toBeInTheDocument();
    expect(screen.getByText("Ready for human review")).toBeInTheDocument();
    const metrics = screen.getByLabelText("Pull request metrics");
    expect(within(metrics).getByText("Time-to-first-hypothesis").nextElementSibling).toHaveTextContent("600ms");
    expect(within(metrics).getByText("Files touched").nextElementSibling).toHaveTextContent("1");
    expect(within(metrics).getByText("Tests added / updated").nextElementSibling).toHaveTextContent("1");
    expect(within(metrics).getByText("Human review remaining").nextElementSibling).toHaveTextContent("Required");
    expect(
      screen.getByText(/Requires human approval before merge — Ticketdroid never merges or deploys on its own/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /merge|deploy/i })).not.toBeInTheDocument();
  });

  it("shows the recorded run (PR view) when a run already exists, with no run button", async () => {
    routes["/api/tickets/TICKET-1042/run"] = runResult;
    await renderApp();
    await userEvent.click(screen.getByText("Duplicate claim submission detected — claims-api"));
    await waitFor(() => {
      expect(window.location.hash).toBe("#/tickets/TICKET-1042");
    });

    expect(await screen.findByText("Run complete")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run Ticketdroid" })).not.toBeInTheDocument();
    expect(screen.getByText(/Workspace is now patched — reset restores the planted bug/)).toBeInTheDocument();
  });

  it("resets the recorded run through the demo reset control", async () => {
    routes["/api/tickets/TICKET-1042/run"] = runResult;
    routes["POST /api/demo/reset"] = {
      status: "reset",
      ticketId: "TICKET-1042",
      detail: "Planted TICKET-1042 bug restored; ready for a new run.",
    };
    const fetchMock = vi.mocked(globalThis.fetch);
    await renderApp();
    await userEvent.click(screen.getByText("Duplicate claim submission detected — claims-api"));
    expect(await screen.findByText("Run complete")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Reset demo" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) => String(input) === "/api/demo/reset" && init?.method === "POST",
        ),
      ).toBe(true);
    });
    expect(await screen.findByRole("button", { name: "Run Ticketdroid" })).toBeInTheDocument();
    expect(screen.queryByText("Run complete")).not.toBeInTheDocument();
  });

  it("shows the blocked gate message when the workspace is not runnable", async () => {
    routes["/api/demo/status"] = {
      ...statusBody,
      gate: "patched_green",
      detail: "Workspace is patched; reset is required before a new run.",
    };
    await renderApp();
    await userEvent.click(screen.getByText("Duplicate claim submission detected — claims-api"));
    await waitFor(() => {
      expect(window.location.hash).toBe("#/tickets/TICKET-1042");
    });

    expect(await screen.findByText(/Workspace is patched; reset is required before a new run/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run Ticketdroid" })).not.toBeInTheDocument();
  });
});

describe("error handling", () => {
  it("renders a bounded error state when the API is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/Could not reach the claims-api service/)).toBeInTheDocument();
    });
  });
});
