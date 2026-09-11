import type { Server } from "node:http";
import { createApp } from "./http/app.js";

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? "4310");

const app = createApp();

const server: Server = app.listen(PORT, HOST, () => {
  console.log(`claims-api listening on http://${HOST}:${PORT}`);
});

function shutdown(): void {
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
