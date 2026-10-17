# PulseDesk

PulseDesk is a small TypeScript demonstration application for investigating
synthetic support and operational tickets. It includes a React inbox, an
Express API, deterministic regression evidence, and a reviewable patch flow.

This repository is prepared as an application target for a separate delivery
demonstration. It has no dependency on an external coding agent and performs
no automatic merge or deployment.

## Quick start

```bash
pnpm install
pnpm --dir claims-api dev
pnpm --dir web dev
```

Then open the URL printed by Vite. The API listens on its configured local
port and exposes `GET /api/health` for readiness checks.

## Validate

```bash
pnpm --dir claims-api gate
pnpm --dir web test
pnpm --dir scheduling-api test
pnpm -r typecheck
```

The baseline gate expects the planted `TICKET-1042` regression to be red and
fails if any unrelated claims test is red. Some read-only sample tickets also
retain their own failing regression fixtures, so a recursive all-workspace test
is intentionally not the baseline validation command.

All fixtures are synthetic and must remain free of real patient or customer
data. See `AGENTS.md` for repository-specific development and safety rules.
