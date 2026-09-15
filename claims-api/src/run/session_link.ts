/**
 * Deep link that opens the Factory session in the Factory desktop app.
 * The app registers the `factory-desktop://` scheme and maps
 * `factory-desktop://<host><path>` to its `/<host><path>` route, so a session
 * with id `abc` opens at `factory-desktop://sessions/abc`.
 *
 * The app live-streams only sessions it owns; an exec-driven run's session
 * page there is a snapshot of the transcript, so Ticketdroid links to it for
 * the full session record rather than auto-opening it mid-run.
 */
export function factorySessionUrl(sessionId: string): string {
  return `factory-desktop://sessions/${encodeURIComponent(sessionId)}`;
}
