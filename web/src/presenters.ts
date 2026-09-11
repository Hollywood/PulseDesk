import type { Ticket } from "./types";

/** Stable row ordering for the inbox: newest created first, then by id. */
export function inboxOrder(a: Ticket, b: Ticket): number {
  return b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id);
}

export function formattedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
