import { useEffect, useState } from "react";
import { fetchDemoStatus, fetchTicketRun, resetDemo, startTicketRun } from "./api";
import type { Ticket, TicketRunResult } from "./types";
import { SeverityBadge, StatusBadge } from "./ui/badges";
import { DetailMetadata, SourceLabel } from "./ui/metadata";
import { RunResultView } from "./RunResultView";

type RunState =
  | { status: "loading" }
  | { status: "idle" }
  | { status: "running" }
  | { status: "resetting" }
  | { status: "blocked"; message: string }
  | { status: "error"; message: string }
  | { status: "ready"; run: TicketRunResult };

export function TicketDetail({ ticket }: { ticket: Ticket }) {
  const [run, setRun] = useState<RunState>({ status: "idle" });

  useEffect(() => {
    if (!ticket.wired) {
      return;
    }
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
  }, [ticket.id, ticket.wired]);

  async function handleRun(): Promise<void> {
    setRun({ status: "running" });
    try {
      const result = await startTicketRun(ticket.id);
      setRun({ status: "ready", run: result });
    } catch (error) {
      const message =
        error instanceof Error && error.message.length > 0 ? error.message : "The run could not be completed.";
      setRun({ status: "error", message });
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
        {!ticket.wired ? (
          <p className="run__na">Read-only signal — no automated run for this ticket.</p>
        ) : run.status === "ready" ? (
          <>
            <RunResultView run={run.run} />
            <div className="run__actions">
              <button type="button" className="run__reset-button" onClick={() => void handleReset()}>
                Reset demo
              </button>
              <p className="run__result">
                Workspace is now patched — reset restores the planted bug so the demo can run again.
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
            <p className="run__result">Executing intake → code search → hypothesis → patch. This takes a few seconds.</p>
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
          <>
            <button type="button" className="run__button" onClick={() => void handleRun()}>
              Retry run
            </button>
            <p className="run__result run__result--error">{run.message}</p>
          </>
        ) : (
          <>
            <button type="button" className="run__button" onClick={() => void handleRun()}>
              Run Ticketdroid
            </button>
            <p className="run__result">
              Runs RCA, applies the real fix, and shows the genuine diff for the planted TICKET-1042 bug.
            </p>
          </>
        )}
      </section>
    </article>
  );
}
