import { useEffect, useState } from "react";
import { formatElapsed } from "./RunLiveView";
import type { RunEvent, Ticket } from "./types";

/** Rows kept in the live feed; older work scrolls out of the window. */
const VISIBLE_FEED = 40;

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
  | { status: "complete"; detail: string; sessionUrl: string | null }
  | { status: "failed"; detail: string; sessionUrl: string | null };

interface FeedRow {
  key: string;
  kind: "session" | "activity" | "thinking" | "message";
  label: string;
  text: string;
}

function feedRow(event: LiveEvent, index: number): FeedRow {
  const key = `${index}-${event.at}`;
  switch (event.kind) {
    case "session":
      return { key, kind: "session", label: "session", text: `Factory session ${event.sessionId.slice(0, 8)} started` };
    case "activity":
      return { key, kind: "activity", label: event.tool, text: event.detail };
    case "thinking":
      return { key, kind: "thinking", label: "thinking", text: event.text };
    case "message":
      return { key, kind: "message", label: "droid", text: event.text };
  }
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
            ? { status: "complete", detail: event.detail, sessionUrl }
            : { status: "failed", detail: event.detail, sessionUrl };
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
      </header>

      {state.status === "waiting" ? (
        <p className="live-session__waiting">Waiting for the droid session to start…</p>
      ) : state.status === "live" ? (
        <>
          <p className="live-session__focus">
            {focus !== undefined && "text" in focus ? focus.text : "Starting a Factory droid session and reading the ticket…"}
          </p>
          <ol className="live-session__feed">
            {state.events
              .map((event, index) => feedRow(event, index))
              .slice(-VISIBLE_FEED)
              .reverse()
              .map((row) => (
                <li key={row.key} className="live-session__row">
                  <span className={`live-session__kind${row.kind === "activity" ? " live-session__kind--tool" : ""}`}>
                    {row.label}
                  </span>
                  <span className="live-session__text">{row.text}</span>
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
  if (state.status !== "live") {
    return state.status === "complete" ? state.sessionUrl : null;
  }
  const session = state.events.find(
    (event): event is Extract<RunEvent, { kind: "session" }> => event.kind === "session",
  );
  return session === undefined ? null : session.sessionUrl;
}
