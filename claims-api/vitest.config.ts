import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Deterministic: no watch, no parallelism-induced ordering surprises for the
    // small planted-bug suite. Fresh processes must yield identical results.
    reporters: ["default"],
  },
});
