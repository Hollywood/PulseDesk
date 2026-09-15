import { useEffect, useState } from "react";
import { formatElapsed } from "./RunLiveView";
import type { RunEvent, Ticket } from "./types";

/** Progress events shown in the feed; the finished event resolves the view instead. */
type LiveEvent = Exclude<RunEvent, { kind: "finished" }>;

/**
 * The droid's live work in a window of its own: the Factory app only
 * live-streams sessions it owns, so an exec-driven run's session page there is
 * a snapshot. Ticketdroid streams the same session's progress here, and links
 * to the Factory session for the full transcript.
 */
type LiveState =
  | { status: "waiting" }
  | { status: "live"; startedAt: number; events: readonly LiveEvent[] }
  | { status: "complete"; detail: string; sessionUrl: string | null; events: readonly RunEvent[] }
  | { status: "failed"; detail: string; sessionUrl: string | null; events: readonly RunEvent[] };

interface ProgressStep {
  title: string;
  detail: string;
  complete: boolean;
}

function progressSteps(events: readonly RunEvent[]): readonly ProgressStep[] {
  const hasUpdate = events.some((event) => event.kind === "message" || event.kind === "thinking");
  const hasInspection = events.some(
    (event) => event.kind === "activity" && ["read", "grep", "glob"].includes(event.tool.toLowerCase()),
  );
  const hasValidation = events.some(
    (event) =>
      event.kind === "activity" &&
      event.tool.toLowerCase() === "execute" &&
      /\b(test|check|lint|build)\b/i.test(event.detail),
  );

  return [
    { title: "Reviewing the alert", detail: "Confirming the reported impact and scope.", complete: hasUpdate },
    { title: "Tracing the cause", detail: "Following the affected workflow and related safeguards.", complete: hasInspection },
    { title: "Preparing a safe fix", detail: "Making a focused change and checking it against the regression.", complete: hasValidation },
  ];
}

function downloadTrace(ticket: Ticket, events: readonly RunEvent[]): void {
  const trace = {
    ticketId: ticket.id,
    ticketTitle: ticket.title,
    downloadedAt: new Date().toISOString(),
    events,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(trace, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${ticket.id.toLowerCase()}-droid-trace.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function LiveSessionView({ ticket }: { ticket: Ticket }) {
  const [state, setState] = useState<LiveState>({ status: "waiting" });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    document.title = `${ticket.id} — live droid session`;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticket.id]);

  useEffect(() => {
    if (typeof EventSource === "undefined") {
      return;
    }
    // The stream closes when no run is in flight. Letting EventSource
    // reconnect on its own bridges the gap between the window opening and the
    // run's session starting, and re-attaches after a mid-run reload.
    const source = new EventSource(`/api/tickets/${encodeURIComponent(ticket.id)}/run/events`);
    source.onmessage = (message: MessageEvent<string>) => {
      let event: RunEvent;
      try {
        event = JSON.parse(message.data) as RunEvent;
      } catch {
        return;
      }
      if (event.kind === "finished") {
        source.close();
        setState((current) => {
          if (current.status === "complete" || current.status === "failed") {
            return current;
          }
          const sessionUrl = sessionLinkFrom(current);
          return event.ok
            ? { status: "complete", detail: event.detail, sessionUrl, events: [...(current.status === "live" ? current.events : []), event] }
            : { status: "failed", detail: event.detail, sessionUrl, events: [...(current.status === "live" ? current.events : []), event] };
        });
        return;
      }
      setState((current) => {
        if (current.status === "complete" || current.status === "failed") {
          return current;
        }
        const events = current.status === "live" ? current.events : [];
        return {
          status: "live",
          startedAt: current.status === "live" ? current.startedAt : event.at,
          events: [...events, event],
        };
      });
    };
    return () => source.close();
  }, [ticket.id]);

  const sessionUrl = sessionLinkFrom(state);
  const actions = state.status === "live" ? state.events.filter((event) => event.kind === "activity").length : 0;
  const focus =
    state.status === "live"
      ? [...state.events].reverse().find((event) => event.kind === "message" || event.kind === "thinking")
      : undefined;
  const traceEvents = state.status === "waiting" ? [] : state.events;
  const steps = progressSteps(traceEvents);

  return (
    <section className="live-session" aria-live="polite">
      <header className="live-session__head">
        <span className="run-live__pulse" aria-hidden="true" />
        <h1 className="live-session__title">{ticket.id}</h1>
        <p className="live-session__subtitle">{ticket.title}</p>
        <a className="back-link" href={`#/tickets/${encodeURIComponent(ticket.id)}`}>
          ← Back to ticket
        </a>
        {state.status === "live" ? (
          <dl className="run-live__metrics">
            <div>
              <dt>Elapsed</dt>
              <dd>{formatElapsed(now - state.startedAt)}</dd>
            </div>
            <div>
              <dt>Actions</dt>
              <dd>{actions}</dd>
            </div>
          </dl>
        ) : null}
        {state.status === "live" && sessionUrl !== null ? (
          <a className="run-live__link" href={sessionUrl}>
            Open in Factory ↗
          </a>
        ) : null}
        {traceEvents.length > 0 ? (
          <button type="button" className="live-session__download" onClick={() => downloadTrace(ticket, traceEvents)}>
            Download full trace
          </button>
        ) : null}
      </header>

      {state.status === "waiting" ? (
        <p className="live-session__waiting">Waiting for the droid session to start…</p>
      ) : state.status === "live" ? (
        <>
          <p className="live-session__focus">
            {focus !== undefined && "text" in focus ? focus.text : "Starting a Factory droid session and reading the ticket…"}
          </p>
          <ol className="live-session__progress" aria-label="Run progress">
            {steps.map((step, index) => (
              <li key={step.title} className={`live-session__step${step.complete ? " live-session__step--complete" : ""}`}>
                <span className="live-session__step-number">{step.complete ? "✓" : index + 1}</span>
                <span>
                  <strong>{step.title}</strong>
                  <small>{step.detail}</small>
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : state.status === "complete" ? (
        <div className="live-session__done">
          <h2 className="live-session__done-title">Run complete</h2>
          <p className="live-session__detail">{state.detail}</p>
          <div className="live-session__links">
            <a className="live-session__cta" href={`#/tickets/${encodeURIComponent(ticket.id)}`}>
              View the PR view →
            </a>
            {state.sessionUrl !== null ? (
              <a className="live-session__cta" href={state.sessionUrl}>
                Open in Factory ↗
              </a>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="live-session__done">
          <h2 className="live-session__done-title">The run could not be completed</h2>
          <p className="live-session__detail">{state.detail}</p>
          <div className="live-session__links">
            <a className="live-session__cta" href={`#/tickets/${encodeURIComponent(ticket.id)}`}>
              Back to the ticket →
            </a>
            {state.sessionUrl !== null ? (
              <a className="live-session__cta" href={state.sessionUrl}>
                Open in Factory ↗
              </a>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function sessionLinkFrom(state: LiveState): string | null {
  if (state.status === "waiting") {
    return null;
  }
  if (state.status !== "live") {
    return state.sessionUrl;
  }
  const session = state.events.find(
    (event): event is Extract<RunEvent, { kind: "session" }> => event.kind === "session",
  );
  return session === undefined ? null : session.sessionUrl;
}
