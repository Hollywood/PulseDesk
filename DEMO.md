# Demo

## Reset
- Run the demo-reset skill / restore planted-bug state
- Confirm claims-api tests fail on the duplicate-claim regression

## Click path
1. Start API and web
2. Open ticket inbox
3. Click any ticket (TICKET-1042, 1038, 1029, or 1015)
4. Click Run Ticketdroid — claims-api calls back to Factory, which starts a
   real droid session for the ticket
5. When the droid finishes, walk Intake → Code search → Hypothesis → Patch
6. Open PR view (reviewable — no auto-merge, no auto-deploy)
7. Show human verification checklist

Every run happens on a local `ticketdroid/<TICKET-ID>` branch only; it never
pushes. Reset removes that local branch, untracked run files, and run
artifacts, then checks out `main`.

## Backup
- 90s screen recording if live path flakes
