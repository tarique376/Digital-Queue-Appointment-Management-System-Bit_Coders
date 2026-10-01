# Verification

Run `npm run typecheck`, `npm test`, and `npm run build`.

Domain tests use isolated PGlite PostgreSQL engines with the real SQL migrations and commands. They never use DATABASE_URL. Coverage includes competing booking, shared service capacity, rollback, idempotency, duplicate check-in, appointment eligibility, exclusive staff claims, lifecycle, token limits, transitions, skip/recall/no-shows, permissions, estimates, fairness, jobs, calendars, scoped responses, and sessions.

PGlite serializes test transactions in one process. These checks do not prove hosted connection pooling or cross-process PostgreSQL locks; verify parallel commands against an isolated Neon development database before release.

## Browser checks

```powershell
npx playwright install chromium
npm run test:e2e
```

An existing Windows Chrome can be used instead:

```powershell
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:e2e
```

The suite starts port 3100 with a rebuilt, explicitly test-only `.test-db/browser` fixture. It exercises booking/reschedule/cancel, customer/staff/public-display lifecycle, admin forms/reports, mobile layout/navigation, unauthenticated/origin restrictions, and client errors. Screenshots go to output/screenshots; failed traces go to test-results. This test mode requires PLAYWRIGHT_TEST=1 and cannot activate in production.

## Hosted/manual checks

After supplying DATABASE_URL, migrate/seed and verify `/api/health`. Use separate customer/staff sessions. Race two bookings for the last place and two staff calls for one token. Restart and verify persistence. Run jobs and verify reminders/no-shows. Exercise closed departments, paused counters, late arrivals, role boundaries, token/day reset, account disabling, mobile layout, and backup restoration. Follow the full acceptance scenarios in DEVELOPMENT_PLAN.md.

`npm run db:verify` runs real pooled-connection concurrency/lifecycle checks inside a uniquely created verification schema, then removes only that schema. It needs schema-creation permission and preserves application data. `npm run test:hosted` checks all seeded roles and public display in the running application, using the private SEED_PASSWORD without printing it. Screenshots are saved under output/screenshots. Use a development/demo database for these commands.
