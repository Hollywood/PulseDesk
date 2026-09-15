import type { Server } from "node:http";
import { createApp, defaultDeps } from "./http/app.js";
import { createLogger } from "./logger.js";

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? "4310");

const logger = createLogger();
const app = createApp(defaultDeps(), logger);

const server: Server = app.listen(PORT, HOST, () => {
  logger.info({ event: "server_started", host: HOST, port: PORT }, "claims-api listening");
});

server.on("error", (error) => {
  logger.error({ event: "server_error", err: error }, "claims-api server error");
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ event: "shutdown_started", signal }, "claims-api shutting down");
  server.close((error) => {
    if (error !== undefined) {
      logger.error({ event: "shutdown_failed", err: error }, "claims-api shutdown failed");
      process.exitCode = 1;
      return;
    }
    logger.info({ event: "shutdown_completed" }, "claims-api shutdown complete");
    process.exitCode = 0;
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
