# QueueFlow - Project Explanation

## Purpose

The Next.js application combines appointments, walk-in tokens, live tracking, counter/staff operations, notifications, and organization reporting for one organization with multiple departments. Customers, staff, managers, and administrators have different server-enforced scopes.

## Important folders/files

| Location | Purpose |
| --- | --- |
| src/app/layout.tsx, page.tsx, globals.css | Application entry, layout, responsive visual design |
| src/app/display/page.tsx | Public token/counter display |
| src/app/api/*/route.ts | Authentication, commands, slots/state, display, health, scheduled jobs |
| src/components/workspace.tsx | Role navigation, dashboard/auth, five-second refresh, notifications |
| src/components/customer.tsx | Booking, reschedule, check-in, personal queue/history |
| src/components/operations.tsx | Staff console, counters, reports, activity log |
| src/components/management.tsx | Departments/rules, services, accounts, staff/counters, closures |
| src/lib/domain.ts | Authoritative appointment, queue, resource, estimate, state/report logic |
| src/lib/db.ts | pg pool and transaction/organization lock |
| src/lib/auth.ts, http.ts | Passwords/sessions, validation/access/origin/errors |
| src/lib/time.ts | Organization-local calendars and working windows |
| src/lib/jobs.ts | Reminders, expiry, approaching-turn alerts, cleanup, SMTP retries |
| database/*.sql | Versioned schema and serving-staff/duration snapshots |
| scripts/ | Migration, seed, and minute-worker commands |
| tests/ | PostgreSQL domain scenarios and browser journeys |
| docs/ | Setup, policies, API, deployment, testing, submission |

## Appointment logic

In domain.ts, slots() generates service-duration windows and computes conservative shared capacity. reserve() validates availability, user overlap/daily limits, and confirmation. command() runs mutations transactionally and stores idempotent results. Rescheduling links a replacement and rolls back on failure. Check-in validates arrival policy and creates one token whose eligibility is no earlier than its appointment start. Staff start/completion synchronizes the appointment.

## Queue and staff logic

issueToken() enforces active limits and increments a service/day sequence. orderedQueue() mixes due appointments with walk-ins and elevates sufficiently old walk-ins for fairness. Call Next atomically claims one compatible token and makes the counter busy. Commands support recall/skip/missed/start/complete/cancel and update counters, events, and notification records.

## Intelligent feature

enrichTokens() estimates waiting workload using actual eligible order, compatible active counters, competing service durations, and remaining active work. It uses configured/snapshotted durations until five measured completions exist, then the mean of up to 30 recent service durations. No capacity means no numeric estimate. This is deterministic historical estimation; optional AI forecasting/optimization is not implemented.

## Connections and persistence

The browser calls Next.js JSON routes, which authenticate/validate and invoke server domain logic. PostgreSQL is accessed through server-only DATABASE_URL, with Neon proposed as the online provider. Tables preserve users/sessions, departments/services, counters/assignments, closures, appointments, tokens/sequences, audit/events, notifications, reset tokens, and idempotency results.

All business mutations lock the settings row across processes, protecting capacity and claims. Read responses are role/owner/department scoped. The public display contains only safe token/counter data. Browser views refresh every five seconds; the minute worker or protected scheduled endpoint handles reminders, no-shows, approaching alerts, and optional SMTP retries.

## Reports, checks, and practical limits

Reports include date-based appointments/walk-ins/outcomes, current waiting/counters, measured wait/service time, department/service demand, snapshotted staff workload, arrival hours, approximate queue history, rates, and seven-day trends. Definitions are documented in BUSINESS_RULES.md.

Sixteen domain tests use isolated PostgreSQL engines and seven browser tests exercise real user/API workflows. TypeScript and the production build pass. Separate hosted PostgreSQL checks verify competing bookings, reschedule rollback, exclusive token claiming, and service completion across pooled connections. Browser smoke checks verify all four seeded roles, health, and public display using the connected Neon database. The dependency audit reports zero known production vulnerabilities at verification time.

SETUP.md describes startup; DEPLOYMENT.md covers hosting/worker/backups; SUBMISSION.md covers video/access requirements. Practical limits include polling, conservative capacity, fixed role permissions, full-day closures, approximate hourly history, and no native app/SMS/optional AI/manual service transfer. Hosted credentials and final publication use the user's chosen account/environment.
