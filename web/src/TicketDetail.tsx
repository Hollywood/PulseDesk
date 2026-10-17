import { useEffect, useRef, useState } from "react";
import { fetchDemoStatus, fetchTicketRun, resetDemo, startTicketRun, subscribeRunEvents } from "./api";
import type { RunEvent, Ticket, TicketRunResult } from "./types";
import { SeverityBadge, StatusBadge } from "./ui/badges";
import { DetailMetadata, SourceLabel } from "./ui/metadata";
import { RunLiveView } from "./RunLiveView";
import { RunResultView } from "./RunResultView";

type RunState =
  | { status: "loading" }
  | { status: "idle" }
  | { status: "running"; startedAt: number; events: readonly RunEvent[] }
  | { status: "resetting" }
  | { status: "blocked"; message: string }
  | { status: "error"; message: string }
  | { status: "ready"; run: TicketRunResult };

export function TicketDetail({ ticket }: { ticket: Ticket }) {
  const [run, setRun] = useState<RunState>({ status: "idle" });
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopFollowing(), []);

  useEffect(() => {
    let cancelled = false;
    setRun({ status: "loading" });
    void (async () => {
      try {
        const existing = await fetchTicketRun(ticket.id);
        if (cancelled) {
          return;
        }
        if (existing !== null) {
          setRun({ status: "ready", run: existing });
          return;
        }
        const status = await fetchDemoStatus();
        if (cancelled) {
          return;
        }
        if (status.gate === "expected_red") {
          setRun({ status: "idle" });
          // A run may already be in flight from another tab or before a reload;
          // the stream closes immediately when it is not, so this costs nothing.
          follow(null);
        } else {
          setRun({ status: "blocked", message: status.detail });
        }
      } catch {
        if (!cancelled) {
          setRun({ status: "error", message: "Could not reach the claims-api service." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticket.id]);

  function stopFollowing(): void {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  }

  /**
   * Follows the analysis run's live events. `startedAt` is null when the run
   * was started elsewhere, in which case the first event's timestamp is used.
   * A finished event resolves the view from the recorded run, so a reloaded page
   * still lands on the result.
   */
  function follow(startedAt: number | null): void {
    stopFollowing();
    unsubscribeRef.current = subscribeRunEvents(ticket.id, (event) => {
      if (event.kind === "finished") {
        stopFollowing();
        void (async () => {
          const recorded = await fetchTicketRun(ticket.id).catch(() => null);
          if (recorded !== null) {
            setRun({ status: "ready", run: recorded });
          } else if (!event.ok) {
            setRun({ status: "error", message: event.detail });
          } else {
            setRun({ status: "idle" });
          }
        })();
        return;
      }
      setRun((current) =>
        current.status === "running"
          ? { ...current, events: [...current.events, event] }
          : { status: "running", startedAt: startedAt ?? event.at, events: [event] },
      );
    });
  }

  /** Opens an optional external agent session when one is attached to the run. */
  function openLiveWindow(): void {
    if (run.status !== "running") {
      return;
    }
    const session = run.events.find(
      (event): event is Extract<RunEvent, { kind: "session" }> => event.kind === "session",
    );
    if (session !== undefined) {
      window.open(session.sessionUrl, "_blank", "noopener,noreferrer");
    }
  }

  async function handleRun(): Promise<void> {
    setRun({ status: "running", startedAt: Date.now(), events: [] });
    follow(Date.now());
    try {
      const result = await startTicketRun(ticket.id);
      setRun({ status: "ready", run: result });
    } catch (error) {
      const message =
        error instanceof Error && error.message.length > 0 ? error.message : "The run could not be completed.";
      setRun({ status: "error", message });
    } finally {
      stopFollowing();
    }
  }

  async function handleReset(): Promise<void> {
    stopFollowing();
    setRun({ status: "resetting" });
    try {
      await resetDemo();
      setRun({ status: "idle" });
    } catch (error) {
      const message =
        error instanceof Error && error.message.length > 0 ? error.message : "The demo could not be reset.";
      setRun({ status: "error", message });
    }
  }

  return (
    <article className="detail">
      <a className="back-link" href="#/">
        ← Back to inbox
      </a>

      <header className="detail__header">
        <div className="detail__title">
          <span className="ticket-id">{ticket.id}</span>
          <h1>{ticket.title}</h1>
        </div>
        <div className="detail__badges">
          <SeverityBadge severity={ticket.severity} />
          <StatusBadge status={ticket.status} />
          <SourceLabel source={ticket.source} />
        </div>
      </header>

      <DetailMetadata ticket={ticket} />

      <section className="detail__section">
        <h2>Summary</h2>
        <p className="detail__summary">{ticket.summary}</p>
      </section>

      <section className="detail__section">
        <h2>Alert body</h2>
        <pre className="alert-body">{ticket.alert_body}</pre>
      </section>

      <section className="run">
        {run.status === "ready" ? (
          <>
            <RunResultView run={run.run} />
            <div className="run__actions">
              <button type="button" className="run__reset-button" onClick={() => void handleReset()}>
                Reset demo
              </button>
              <p className="run__result">
                Workspace is now patched on local branch {run.run.branchName ?? `pulsedesk/${ticket.id}`} — reset restores the planted state, removes the branch, and checks out main.
              </p>
            </div>
          </>
        ) : run.status === "loading" ? (
          <p className="run__result">Loading…</p>
        ) : run.status === "running" ? (
          <>
            <div className="run__actions">
              <button type="button" className="run__button" disabled>
                Running PulseDesk analysis…
              </button>
              <button
                type="button"
                className="run__reset-button"
                onClick={openLiveWindow}
                disabled={!run.events.some((event) => event.kind === "session")}
              >
                Live Window ↗
              </button>
            </div>
            <RunLiveView events={run.events} startedAt={run.startedAt} />
            <p className="run__result">
              The local analysis is working on branch pulsedesk/{ticket.id}. No code is pushed, merged, or deployed.
            </p>
          </>
        ) : run.status === "resetting" ? (
          <>
            <button type="button" className="run__button" disabled>
              Resetting demo…
            </button>
            <p className="run__result">Restoring the planted TICKET-1042 bug and clearing the recorded run.</p>
          </>
        ) : run.status === "blocked" ? (
          <div className="run__actions">
            <button type="button" className="run__reset-button" onClick={() => void handleReset()}>
              Reset demo
            </button>
            <p className="run__result">{run.message}</p>
          </div>
        ) : run.status === "error" ? (
          <div className="run__actions">
            <button type="button" className="run__button" onClick={() => void handleRun()}>
              Retry run
            </button>
            <button type="button" className="run__reset-button" onClick={() => void handleReset()}>
              Reset demo
            </button>
            <p className="run__result run__result--error">{run.message}</p>
          </div>
        ) : ticket.wired ? (
          <>
            <button type="button" className="run__button" onClick={() => void handleRun()}>
              Run PulseDesk analysis
            </button>
            <p className="run__result">
              Runs the local regression workflow for {ticket.id}, prepares a focused patch, and returns reviewable evidence.
            </p>
          </>
        ) : (
          <p className="run__result">This ticket is available for review but has no automated local run.</p>
        )}
      </section>
    </article>
  );
}
