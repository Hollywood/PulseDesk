import { spawn } from "node:child_process";

/**
 * Deep link that opens the live Factory session in the Factory desktop app.
 * The app registers the `factory-desktop://` scheme and maps
 * `factory-desktop://<host><path>` to its `/<host><path>` route, so a session
 * with id `abc` opens at `factory-desktop://sessions/abc`.
 */
export function factorySessionUrl(sessionId: string): string {
  return `factory-desktop://sessions/${encodeURIComponent(sessionId)}`;
}

/**
 * Auto-opens the live Factory session while the droid investigates a ticket,
 * so the work is watchable the moment the session exists. Best-effort demo
 * presentation: macOS `open` hands the deep link to the registered handler
 * (the Factory app); other platforms skip it and the run view's link remains
 * the fallback. Failures are swallowed on purpose — a missing launcher or
 * app must never fail the run itself.
 */
export function openFactorySession(sessionId: string, platform: NodeJS.Platform = process.platform): void {
  if (platform !== "darwin") {
    return;
  }
  try {
    const child = spawn("open", [factorySessionUrl(sessionId)], {
      stdio: "ignore",
      detached: true,
    });
    child.on("error", () => {});
    child.unref();
  } catch {
    // Ignored: auto-open is presentation, never run evidence.
  }
}
