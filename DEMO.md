# PulseDesk local demo

## Start the application

1. Run `pnpm install` at the repository root.
2. Run `pnpm dev` in `claims-api/`.
3. Run `pnpm dev` in `web/`.
4. Open the local URL printed by Vite.

## Walk through the ticket workflow

1. Open `TICKET-1042` from the inbox.
2. Review the synthetic alert and customer-impact summary.
3. Select **Run PulseDesk analysis**.
4. Wait while the local regression gate reproduces the failure, applies the
   focused patch on a `pulsedesk/TICKET-1042` branch, and reruns the tests.
5. Review the timeline, root-cause analysis, test evidence, diff, and proposed
   pull-request description.
6. Select **Reset demo** before repeating the walkthrough.

The local workflow never pushes, merges, or deploys code. A human remains
responsible for reviewing the proposed patch and deciding whether it should
enter the delivery pipeline.
