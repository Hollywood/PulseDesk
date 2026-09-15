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

  useEffect(
    () => () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    },
    [],
  );

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

  async function handleRun(): Promise<void> {
    setRun({ status: "running", startedAt: Date.now(), events: [] });
    unsubscribeRef.current?.();
    unsubscribeRef.current = subscribeRunEvents(ticket.id, (event) => {
      setRun((current) =>
        current.status === "running" ? { ...current, events: [...current.events, event] } : current,
      );
    });
    try {
      const result = await startTicketRun(ticket.id);
      setRun({ status: "ready", run: result });
    } catch (error) {
      const message =
        error instanceof Error && error.message.length > 0 ? error.message : "The run could not be completed.";
      setRun({ status: "error", message });
    } finally {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    }
  }

  async function handleReset(): Promise<void> {
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
                Workspace is now patched on local branch {run.run.branchName ?? `ticketdroid/${ticket.id}`} — reset restores the planted state, removes the branch, and checks out main.
              </p>
            </div>
          </>
        ) : run.status === "loading" ? (
          <p className="run__result">Loading…</p>
        ) : run.status === "running" ? (
          <>
            <button type="button" className="run__button" disabled>
              Running Ticketdroid…
            </button>
            <RunLiveView events={run.events} startedAt={run.startedAt} />
            <p className="run__result">
              A Factory droid is working in the repository on branch ticketdroid/{ticket.id}. This takes a few minutes.
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
        ) : (
          <>
            <button type="button" className="run__button" onClick={() => void handleRun()}>
              Run Ticketdroid
            </button>
            <p className="run__result">
              Calls back to Factory: a droid investigates {ticket.id}, implements a fix in the repo, and returns a reviewable PR.
            </p>
          </>
        )}
      </section>
    </article>
  );
}
