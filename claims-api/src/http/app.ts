import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import type { WorkspaceState } from "../gate/certify.js";
import { resolveWorkspaceState } from "../gate/state.js";
import { activeStrategyPath } from "../gate/run-tests.js";
import { resetDemo, ResetError, type DemoResetResult } from "../demo/reset.js";
import { buildDemoStatus } from "../demo/status.js";
import { createHttpLogger, createLogger, type Logger } from "../logger.js";
import { createDefaultOrchestrateDeps, runTicket } from "../run/orchestrate.js";
import { readRunArtifact, writeBaselineSnapshot, writeRunArtifact } from "../run/store.js";
import { RunError, type TicketRunResult } from "../run/types.js";
import { loadTickets, type Ticket } from "./tickets.js";

export interface AppDeps {
  getTickets: () => readonly Ticket[];
  getWorkspaceState: () => WorkspaceState;
  /** Executes a full Ticketdroid run for a wired ticket and persists artifacts. */
  startRun: (ticketId: string) => Promise<TicketRunResult>;
  /** Reads the recorded run for a ticket, or null when none exists yet. */
  getRun: (ticketId: string) => TicketRunResult | null;
  /** Restores the planted-bug workspace and removes the generated demo run. */
  resetDemo?: () => DemoResetResult;
}

export function defaultDeps(): AppDeps {
  return {
    getTickets: loadTickets,
    getWorkspaceState: () => resolveWorkspaceState(activeStrategyPath()),
    startRun: async (ticketId) => {
      const deps = createDefaultOrchestrateDeps({
        onPatchApplied: (baseline) => writeBaselineSnapshot(ticketId, baseline),
      });
      const result = await runTicket(ticketId, deps);
      writeRunArtifact(ticketId, result);
      return result;
    },
    getRun: (ticketId) => readRunArtifact(ticketId),
    resetDemo,
  };
}

/** In-flight run guard: one run per ticket at a time. */
const runningTickets = new Set<string>();
const defaultLogger = createLogger({
  level: process.env.NODE_ENV === "test" ? "silent" : undefined,
});

function boundedError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

/** Express 5 types `req.params.id` as string | string[]; the demo routes use a single segment. */
function paramId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? (id[0] ?? "") : id;
}

/**
 * Builds the read-only Ticketdroid API. Dependencies are injected so demo
 * status can be exercised deterministically for every workspace classification.
 * Errors are always bounded JSON with a stable code and never leak stacks,
 * source, commands, or absolute paths.
 */
export function createApp(deps: AppDeps = defaultDeps(), logger: Logger = defaultLogger): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(createHttpLogger(logger));

  app.get("/api/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/api/tickets", (_req: Request, res: Response) => {
    res.status(200).json(deps.getTickets());
  });

  app.get("/api/tickets/:id", (req: Request, res: Response) => {
    const id = req.params.id;
    const ticket = deps.getTickets().find((entry) => entry.id === id);
    if (ticket === undefined) {
      boundedError(res, 404, "ticket_not_found", "No ticket exists with the requested id.");
      return;
    }
    res.status(200).json(ticket);
  });

  app.get("/api/tickets/:id/run", (req: Request, res: Response) => {
    const run = deps.getRun(paramId(req));
    if (run === null) {
      boundedError(res, 404, "no_run_found", "No run has been recorded for this ticket yet.");
      return;
    }
    res.status(200).json(run);
  });

  app.post("/api/tickets/:id/run", async (req: Request, res: Response) => {
    const id = paramId(req);
    const ticket = deps.getTickets().find((entry) => entry.id === id);
    if (ticket === undefined) {
      boundedError(res, 404, "ticket_not_found", "No ticket exists with the requested id.");
      return;
    }
    if (runningTickets.has(id)) {
      boundedError(res, 409, "run_in_progress", "A run for this ticket is already in progress.");
      return;
    }
    runningTickets.add(id);
    try {
      const run = await deps.startRun(id);
      res.status(201).json(run);
    } catch (error) {
      if (error instanceof RunError) {
        boundedError(res, 409, error.code, error.message);
        return;
      }
      res.err = error instanceof Error ? error : new Error("Unexpected non-error rejection");
      boundedError(res, 500, "run_failed", "The run could not be completed.");
    } finally {
      runningTickets.delete(id);
    }
  });

  app.get("/api/demo/status", (_req: Request, res: Response) => {
    res.status(200).json(buildDemoStatus(deps.getWorkspaceState()));
  });

  app.post("/api/demo/reset", (_req: Request, res: Response) => {
    if (deps.resetDemo === undefined) {
      boundedError(res, 503, "reset_unavailable", "Demo reset is not available.");
      return;
    }
    try {
      res.status(200).json(deps.resetDemo());
    } catch (error) {
      if (error instanceof ResetError) {
        boundedError(res, 409, error.code, error.message);
        return;
      }
      res.err = error instanceof Error ? error : new Error("Unexpected non-error rejection");
      boundedError(res, 500, "reset_failed", "The demo could not be reset.");
    }
  });

  app.use((_req: Request, res: Response) => {
    boundedError(res, 404, "not_found", "The requested resource does not exist.");
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.err = err instanceof Error ? err : new Error("Unexpected non-error rejection");
    boundedError(res, 500, "internal_error", "An unexpected error occurred.");
  });

  return app;
}
