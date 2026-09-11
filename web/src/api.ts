import type { DemoResetResult, Ticket, TicketRunResult } from "./types";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Request to ${path} failed with status ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Extracts the bounded server error message when one is present. */
async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    if (typeof body.error?.message === "string") {
      return body.error.message;
    }
  } catch {
    // fall through to the generic message
  }
  return `Request failed with status ${res.status}.`;
}

/** All tickets in the inbox, newest first per the fixture's create time. */
export function fetchTickets(): Promise<Ticket[]> {
  return getJson<Ticket[]>("/api/tickets");
}

export function fetchTicket(id: string): Promise<Ticket> {
  return getJson<Ticket>(`/api/tickets/${encodeURIComponent(id)}`);
}

/** Starts a Ticketdroid run for the ticket; resolves with the full run result. */
export async function startTicketRun(id: string): Promise<TicketRunResult> {
  const res = await fetch(`/api/tickets/${encodeURIComponent(id)}/run`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res));
  }
  return (await res.json()) as TicketRunResult;
}

/** Reads the recorded run for a ticket, or null when no run exists yet. */
export async function fetchTicketRun(id: string): Promise<TicketRunResult | null> {
  const res = await fetch(`/api/tickets/${encodeURIComponent(id)}/run`, {
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(await errorMessage(res));
  }
  return (await res.json()) as TicketRunResult;
}

/** Reads the current workspace demo status (gate classification). */
export async function fetchDemoStatus(): Promise<{ gate: string; detail: string }> {
  return getJson<{ gate: string; detail: string }>("/api/demo/status");
}

/** Restores the planted TICKET-1042 state using the demo-reset workflow. */
export async function resetDemo(): Promise<DemoResetResult> {
  const res = await fetch("/api/demo/reset", {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res));
  }
  return (await res.json()) as DemoResetResult;
}
