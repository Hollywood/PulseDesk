/**
 * Live progress for an in-flight droid run. The run itself is a single long
 * HTTP request, so the UI follows this stream to see what the droid is doing
 * while it works. Events are held in memory only: they are demo telemetry, not
 * run evidence (the recorded artifact remains the source of truth).
 */
export type RunEvent =
  | { kind: "session"; at: number; sessionId: string }
  | { kind: "activity"; at: number; tool: string; detail: string }
  | { kind: "thinking"; at: number; text: string }
  | { kind: "message"; at: number; text: string }
  | { kind: "finished"; at: number; ok: boolean; detail: string };

/** Newest events kept per ticket, so a client that connects late still sees context. */
const MAX_HISTORY = 200;

type Listener = (event: RunEvent) => void;
type EndListener = () => void;

class RunEventStream {
  private history: RunEvent[] = [];
  private listeners = new Set<{ onEvent: Listener; onEnd: EndListener }>();
  private active = false;

  /** True while a run is streaming, so idle subscribers are not left hanging. */
  isActive(): boolean {
    return this.active;
  }

  replay(): readonly RunEvent[] {
    return this.history;
  }

  begin(): void {
    this.history = [];
    this.active = true;
  }

  publish(event: RunEvent): void {
    this.history.push(event);
    if (this.history.length > MAX_HISTORY) {
      this.history.splice(0, this.history.length - MAX_HISTORY);
    }
    for (const listener of [...this.listeners]) {
      listener.onEvent(event);
    }
  }

  end(ok: boolean, detail: string, at: number): void {
    this.publish({ kind: "finished", at, ok, detail });
    this.active = false;
    for (const listener of [...this.listeners]) {
      listener.onEnd();
    }
    this.listeners.clear();
  }

  subscribe(onEvent: Listener, onEnd: EndListener): () => void {
    const listener = { onEvent, onEnd };
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

const streams = new Map<string, RunEventStream>();

/** The event stream for a ticket, created on first use. */
export function runEvents(ticketId: string): RunEventStream {
  const existing = streams.get(ticketId);
  if (existing !== undefined) {
    return existing;
  }
  const stream = new RunEventStream();
  streams.set(ticketId, stream);
  return stream;
}

/** Drops every stream. Used by tests and after a demo reset. */
export function clearRunEvents(): void {
  streams.clear();
}
