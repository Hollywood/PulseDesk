import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = "http://127.0.0.1:4310";

/**
 * Dev server for the PulseDesk web inbox. `/api` is proxied to the local
 * claims-api service so the browser talks to one origin and the ticket
 * fixture stays the single source of truth inside claims-api.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": apiTarget,
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: {
      "/api": apiTarget,
    },
  },
});
