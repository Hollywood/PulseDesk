# Demo

## Reset
- Run the demo-reset skill / restore planted-bug state
- Confirm claims-api tests fail

## Click path
1. Start API and web
2. Open ticket inbox
3. Click TICKET-1042
4. Click Run Ticketdroid
5. Walk Intake → Code search → Hypothesis → Patch
6. Open PR view (reviewable — no auto-merge, no auto-deploy)
7. Show human verification checklist

Run creates the local `ticketdroid/TICKET-1042` branch only; it never pushes.
Reset removes that local branch and checks out `main`.

## Backup
- 90s screen recording if live path flakes
