/** Builds the browser URL for a Factory session. */
export function factorySessionUrl(sessionId: string): string {
  return `https://app.factory.ai/sessions/${encodeURIComponent(sessionId)}`;
}
