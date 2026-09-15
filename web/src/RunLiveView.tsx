import { useEffect, useState } from "react";
import type { RunEvent } from "./types";

/** Most recent actions shown in the live feed; older ones scroll out of view. */
const VISIBLE_ACTIONS = 8;

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Live view of the droid session behind an in-flight run: elapsed time, what
 * the droid is reasoning about, the actions it is taking in the repository,
 * and a link to the session in the Factory app (whose session page loads
 * exec-driven runs as a snapshot, so the stream here is how to watch live).
 */
export function RunLiveView({ events, startedAt }: { events: readonly RunEvent[]; startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const actions = events.filter((event): event is Extract<RunEvent, { kind: "activity" }> => event.kind === "activity");
  const narration = [...events]
    .reverse()
    .find((event) => event.kind === "message" || event.kind === "thinking");
  const session = events.find((event): event is Extract<RunEvent, { kind: "session" }> => event.kind === "session");

  return (
    <section className="run-live" aria-live="polite">
      <header className="run-live__head">
        <span className="run-live__pulse" aria-hidden="true" />
        <h3 className="run-live__title">Droid session in progress</h3>
        <dl className="run-live__metrics">
          <div>
            <dt>Elapsed</dt>
            <dd>{formatElapsed(now - startedAt)}</dd>
          </div>
          <div>
            <dt>Actions</dt>
            <dd>{actions.length}</dd>
          </div>
          {session !== undefined ? (
            <div>
              <dt>Session</dt>
              <dd className="run-live__session">{session.sessionId.slice(0, 8)}</dd>
            </div>
          ) : null}
        </dl>
        {session !== undefined ? (
          <a className="run-live__link" href={session.sessionUrl}>
            Open in Factory ↗
          </a>
        ) : null}
      </header>

      <p className="run-live__focus">
        {narration !== undefined && "text" in narration
          ? narration.text
          : "Starting a Factory droid session and reading the ticket…"}
      </p>

      {actions.length > 0 ? (
        <ol className="run-live__actions">
          {actions
            .slice(-VISIBLE_ACTIONS)
            .reverse()
            .map((action) => (
              <li key={`${action.at}-${action.tool}-${action.detail}`}>
                <span className="run-live__tool">{action.tool}</span>
                {action.detail !== "" ? <span className="run-live__detail">{action.detail}</span> : null}
              </li>
            ))}
        </ol>
      ) : null}
    </section>
  );
}
