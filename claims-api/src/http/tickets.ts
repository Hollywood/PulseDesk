import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type Ticket = Record<string, unknown>;

/**
 * Absolute path to the immutable, authoritative ticket fixture at the repo
 * root. Resolved from this module's URL so it is independent of the process
 * working directory.
 */
export function fixturePath(): string {
  return fileURLToPath(new URL("../../../fixtures/tickets.json", import.meta.url));
}

let cache: readonly Ticket[] | null = null;

/**
 * Loads the four-ticket fixture exactly as stored on disk. The parsed value is
 * cached because the fixture is immutable for the lifetime of the process, and
 * responses only ever read it.
 */
export function loadTickets(): readonly Ticket[] {
  if (cache === null) {
    cache = JSON.parse(readFileSync(fixturePath(), "utf8")) as Ticket[];
  }
  return cache;
}
