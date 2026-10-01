# QueueFlow - Next.js Digital Queue & Appointment Management

**New to development? Start with the [complete beginner setup guide](docs/BEGINNER_GUIDE.md)** for Windows installation, Neon configuration, everyday startup, role demonstrations, and troubleshooting.

## Run the application

The application is implemented with **Next.js App Router, React, TypeScript, and PostgreSQL**. Connect a free online database such as [Neon](https://neon.com/) using the server-only `DATABASE_URL` in `.env.local`.

```powershell
cd D:\Dileep\DigitalQueueAppointment
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Run `npm run jobs` in a second terminal for reminders, expiry, approaching-turn alerts, and optional email. Read **[docs/SETUP.md](docs/SETUP.md)** for Neon configuration and private seed passwords.

Seeded accounts: `customer@queueflow.local`, `staff@queueflow.local`, `staff2@queueflow.local`, `examstaff@queueflow.local`, `manager@queueflow.local`, and `admin@queueflow.local`. All initial passwords come from your private `SEED_PASSWORD`; credentials are never hard-coded into the application. Use real email addresses for SMTP delivery.

The implemented repository has `src/app` (Next.js pages/APIs), `src/components` (role-specific screens), `src/lib` (domain/auth/database/jobs), `database` (SQL migrations), `scripts`, `tests`, and `docs`. The separate frontend/backend directory tree in the original plan below is superseded by this single Next.js application.

Verification: `npm run typecheck`, `npm test`, `npm run test:e2e`, and `npm run build`. Production startup: `npm start`. Use the committed lockfile with `npm ci` for reproducible versions.

Core features are implemented: accounts/roles, department/service schedules, capacity-safe booking, cancellation/rescheduling/delay, check-in, mixed walk-in/appointment queues, staff calling/recall/skip/start/complete, counter assignments/states, historical-duration wait estimates, notifications, reports, and audit logs. Live views refresh every five seconds with reconnection recovery. Email requires SMTP and the worker. Optional AI forecasting, SMS, native mobile apps, partial-day calendar overrides, and manual in-service transfers are not implemented.

The supplied Neon connection is configured, migrations applied, and demo accounts seeded. Hosted transaction tests and browser checks for all four roles passed. Application publication still requires the chosen host/scheduler. Production never falls back to the isolated test database. Capacity allocation is conservative and mutations use a single organization lock; historical hourly queue snapshots are approximate. These choices are explained in **[BUSINESS_RULES.md](docs/BUSINESS_RULES.md)**. Verified results are recorded in **[IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md)**.

Documentation: [Setup](docs/SETUP.md) · [Business rules](docs/BUSINESS_RULES.md) · [API](docs/API.md) · [Deployment](docs/DEPLOYMENT.md) · [Tests](docs/TESTING.md) · [Project explanation](docs/PROJECT_EXPLANATION.md) · [Submission](docs/SUBMISSION.md).

The submission explanation is also generated as `output/pdf/QueueFlow-Project-Explanation.pdf`. To regenerate it, run `python scripts/export_explanation.py` with the `reportlab` package installed. CI is defined in `.github/workflows/ci.yml` and runs type checks, domain/browser tests, build, and the production dependency audit when the repository is published to GitHub.

## Original module-by-module development plan

The plan below preserves the PDF requirement breakdown. It distinguishes desired behavior and optional extensions from the implementation notes above. An unchanged copy is also preserved in `docs/DEVELOPMENT_PLAN.md`.

## Purpose and source

This README is the complete module-by-module development plan for the project described in **`project 1.pdf` (8 pages)**. The application will let customers book appointments or receive walk-in tokens, track their queue position and estimated wait, and receive service through managed counters. Staff, department managers, and administrators will control service operations and review analytics.

The finished system must demonstrate a connected workflow, backed by persistent data:

**Select service -> book appointment or obtain token -> join the eligible queue -> view position and waiting estimate -> staff calls customer -> service starts -> service completes -> history and analytics update.**

The following sections describe the original development plan. The implementation and setup notes above now accompany it; optional or proposed extensions are not claims of completed features.

### Requirement levels

- **Core:** Features required for the complete operational system described in the PDF.
- **Suggested/configurable:** Policies, examples, possible data fields, and additional analytics in the PDF that need concrete implementation choices.
- **Optional AI:** Enhancements explicitly described as non-mandatory on page 8.
- **Engineering addition:** Supporting behavior proposed here to make the application reliable and testable; it is not a separate requirement quoted from the PDF.

The sample token numbers, capacities, durations, check-in windows, and dashboard counts in the PDF are illustrative, not fixed production settings. The PDF specifies no mandatory programming stack.

## Application scope and roles

| Role | Scope and capabilities |
| --- | --- |
| Customer / Visitor | Register, select departments/services, search availability, book/cancel/reschedule, obtain a walk-in token, check in, track position/wait, receive notifications, and view personal history. |
| Service Staff | Access assigned services/counters, view waiting customers, call next, recall/skip, mark missed, start/complete service, and change counter status. |
| Department Manager | Configure own department's services, counters, staff, shifts, schedules, durations, capacities, and booking rules; monitor workload and analytics. |
| Administrator | Manage departments, users, services, permissions, organization settings, activity, and organization-wide reports. |

The initial release serves one organization with multiple departments. Multiple independent organizations are outside the PDF's explicit scope. A responsive web application satisfies the web/mobile platform choice; a native mobile app is an alternative, not an additional mandatory deliverable.

## Proposed architecture

Use a responsive frontend, a backend API, a relational database, and a background worker. Queue and appointment operations must be authoritative on the backend. Customers, staff, and dashboards receive live updates through a realtime connection, with refresh/polling fallback.

An implementable stack proposal is TypeScript with React for the frontend, a TypeScript backend, and PostgreSQL. Select the actual framework, ORM, hosting, and notification providers during Module 01. This proposal is a project choice, not a PDF requirement; record final choices and setup commands when the application is scaffolded.

```text
Customer UI / Staff UI / Manager UI / Admin UI / Queue Display
                            |
                   Backend API + Realtime
                            |
        Appointment Engine + Queue Engine + Authorization
                            |
                        Database
                            |
       Background Worker: reminders, expiry, notifications, reports
```

Start with one modular backend and one frontend. Appointment and queue logic should remain separate domain modules within that backend. Do not introduce separate services unless a demonstrated need justifies them.

### Proposed repository structure

```text
apps/
  web/src/
    features/             # Customer, staff, manager, and admin screens
    components/           # Shared UI and accessibility primitives
    api/                  # API client and realtime subscriptions
  api/src/
    modules/              # Auth, departments, services, appointments, queue, etc.
    jobs/                 # Scheduled/background work
    infrastructure/       # Database, notifications, realtime, logging
packages/
  contracts/              # Shared API types and validation contracts
database/
  migrations/
  seeds/
tests/
  integration/
  e2e/
docs/
  architecture.md
  business-rules.md
  api.md
  testing.md
  deployment.md
  project-explanation.md
```

These directories are proposed and do not yet exist.

## Business policies to finalize before implementation

Implement policies as validated organization/department configuration rather than scattered constants. The defaults below are proposed starting decisions; the PDF does not specify their exact values or algorithms.

| Topic | Proposed decision |
| --- | --- |
| Timezone | Store timestamps in UTC; generate slots and daily limits in the organization's configured local timezone. |
| Mixed queue ordering | Only checked-in appointments enter the live queue. Due appointments take precedence over ordinary walk-ins; preserve FIFO within each priority class and define a configurable fairness rule to prevent walk-in starvation. |
| Early appointments | Early check-in is permitted within the configured window; eligibility for calling begins at the configured appointment eligibility time. |
| Token numbering | Use a service prefix and monotonically increasing sequence per local service day. Database uniqueness includes service and date. |
| Duplicate appointments | Reject identical active bookings and overlapping appointments for the same user; apply configured daily limits. |
| Duplicate tokens | Initially permit one active queue token per user across the organization; make the permitted count configurable. Appointment check-in and walk-in entry must share this validation. |
| Check-in window | Initially use 10 minutes before/after the appointment start, following the PDF's example; managers can configure it. |
| Cancellation/rescheduling | Configure the cutoff; release capacity atomically. Rescheduling must acquire the new capacity before abandoning the old booking. |
| Skip/recall | Skipped tokens leave the callable queue until explicitly recalled. Recall restores eligibility using a documented priority rule; retain all events. |
| No-show | Expire appointments after the configured check-in deadline; staff may mark called customers missed after a configured response/recall policy. |
| Closed/break counter | Stop new assignments; reassign eligible waiting customers only to compatible active counters. Do not silently transfer an in-service customer. |
| No active compatible counters | Display unavailable/paused status and no numeric wait estimate. Define whether new walk-ins are accepted through department settings. |
| Capacity after missed booking | Release only remaining bookable future capacity; never reopen an elapsed slot. |
| Notification channels | Provide in-app notifications and counter display updates. Configure email delivery; SMS is optional. |

Record the final policy values and examples in `docs/business-rules.md`. Define fairness parameters, cancellation cutoff, response timeout, queue-entry cutoff, and booking horizon explicitly before enabling the associated workflows.

## Module-by-module development plan

### Module 01 - Project foundation and configuration

**Dependencies:** None. **Source:** PDF sections 8 and 11; engineering foundation.

- Finalize the stack, package manager, architecture, naming, and organization defaults.
- Scaffold the frontend/backend, migrations, environment configuration, and development scripts.
- Add configuration validation, health endpoints, consistent API errors, structured logging, and CI checks.
- Create an example environment file without credentials and document local startup.
- Seed a realistic organization, departments, services, role accounts, staff, and counters using clearly marked demo data.

**Acceptance:** A clean checkout can install dependencies, migrate, seed, and start using documented commands. Invalid configuration fails clearly. No secrets are committed.

### Module 02 - Authentication, accounts, and permissions

**Dependencies:** 01. **Source:** Sections 2 and 10.

- Implement registration, login/logout, account status, profile, and secure password/session handling.
- Define Customer, Staff, Department Manager, and Administrator permissions on the backend.
- Enforce record ownership, department scope, and staff assignment scope for every protected operation.
- Prevent public registration from creating privileged accounts; authorized managers/admins assign staff roles.
- Provide user management and account activation/deactivation. Password recovery is a supporting engineering addition.

**Acceptance:** Customers cannot read another customer's private appointments or tokens. Staff/managers cannot operate outside their scope. Disabled accounts lose access according to the documented session policy.

### Module 03 - Departments, services, and organization rules

**Dependencies:** 02. **Source:** Sections 2, 5, 6, and 10.

- Build department and service creation/editing/activation screens and APIs.
- Configure service name, department, duration, token prefix, availability, and eligible counters.
- Configure booking horizon, daily limits, token limits, cancellation/check-in rules, and priority policy.
- Preserve historical references when a department/service is disabled; avoid destructive deletion of referenced records.
- Support department-specific overrides with clear inheritance from organization defaults.

**Acceptance:** Only active services are bookable. Configuration changes are validated, audited, and applied without corrupting existing appointments.

### Module 04 - Staff, shifts, and service counters

**Dependencies:** 03. **Source:** Sections 2 and 6.

- Manage staff ID, department, service skills, counter assignment, shift, and current availability.
- Manage counters and their supported services; expose Available, Busy, Break, and Closed states.
- Allow authorized staff to pause/resume their counters and managers to reassign staff.
- Track current service and counter status history; prevent conflicting active assignments.
- Trigger queue/estimate recalculation when staffing or counter availability changes.

**Acceptance:** A closed/break counter receives no new customers. Incompatible staff/counters cannot serve a token. One counter cannot have two simultaneous active services.

### Module 05 - Working hours, slot generation, and capacity

**Dependencies:** 03-04. **Source:** Section 5.

- Configure weekly working hours, breaks, appointment intervals, per-slot capacity, and daily appointment limits.
- Add date overrides/closures as an engineering addition to support realistic availability.
- Generate slots using local dates, service duration, available counter/staff capacity, and booking horizon.
- Decide how configurable appointment intervals differ from service duration. Longer services must reserve every overlapping resource interval they occupy.
- Return full/available/unavailable states; exclude past times, breaks, and closed periods.
- Enforce capacity through database transactions and locking or equivalent concurrency controls.
- Define how schedule edits affect existing bookings; require an explicit reconciliation workflow rather than silently deleting bookings.

**Acceptance:** Competing requests for the final place cannot overbook. A long appointment cannot overlap incompatible capacity. Breaks, daily limits, and timezone boundaries are respected.

### Module 06 - Appointment booking, cancellation, and rescheduling

**Dependencies:** 02 and 05. **Source:** Sections 2, 3, 5, and 10.

- Build department/service selection, date/slot availability, confirmation, and appointment-detail screens.
- Issue a unique appointment reference after successful capacity reservation.
- Implement Booked and Confirmed states, cancellation, delays, and rescheduling history.
- Validate active service, slot capacity, duplicate/overlapping appointments, user limits, and cancellation rules.
- Make retrying a booking request safe through an idempotency key or equivalent mechanism.
- Keep cancellation and rescheduling capacity changes transactional; trigger notifications after committed changes.

**Acceptance:** Successful bookings persist and appear in history. Failed bookings return useful errors. A failed reschedule leaves the original booking valid. Repeated requests do not create duplicate appointments.

### Module 07 - Check-in, appointment eligibility, and expiry

**Dependencies:** 06; queue integration completes with 08. **Source:** Sections 3 and 7.

- Implement customer check-in and authorized staff-assisted check-in.
- Enforce the configurable arrival window and late-arrival policy.
- Create/link exactly one queue token when an eligible appointment checks in.
- Track Checked In and Waiting; separate arrival time from call eligibility time.
- Run a repeatable background job to mark unchecked-in appointments Missed after their deadline.
- Release appropriate remaining capacity and record check-in/expiry events.

**Acceptance:** Duplicate check-in produces no duplicate token. Early/late arrivals follow configuration. Check-in and expiry racing against one another produce one consistent result.

### Module 08 - Walk-in tokens and mixed queue engine

**Dependencies:** 02-04; integrates with 07. **Source:** Sections 3, 4, 7, and 10.

- Generate unique service-day tokens and enforce active-token limits and queue availability.
- Maintain authoritative eligibility, priority, ordering, and compatible counter routing.
- Calculate people ahead from actual callable order, not by subtracting token numbers.
- Merge checked-in appointments and walk-ins using the documented priority/fairness policy.
- Support Waiting, Called, In Service, Completed, Skipped, Missed, and Cancelled token states.
- Recalculate order when a token joins/leaves, a customer is recalled, or a counter changes status.
- Preserve stable ordering when equally ranked customers arrive; validate every transition.

**Acceptance:** Parallel token creation remains unique. Appointments and walk-ins are both served. Position excludes completed/missed/cancelled entries and accounts for priority changes. Duplicate active tokens are rejected.

### Module 09 - Staff calling and service lifecycle

**Dependencies:** 04 and 08. **Source:** Sections 2, 3, and 7.

- Build a staff console with waiting list, assigned counter, current customer, appointment context, and permitted actions.
- Implement atomic Call Next: select/claim one eligible token and mark the counter busy.
- Implement recall, skip, mark missed, start service, and complete service with valid transition checks.
- Capture called, service-start, and completion timestamps, staff ID, counter ID, and action actor.
- Complete the linked appointment when service completes; free the counter and update all downstream metrics.
- Define an explicit interrupted-service/transfer procedure as an engineering addition.

**Acceptance:** Two staff members cannot claim the same token. Repeated completion does not duplicate records. Unauthorized or out-of-order actions fail clearly. Completion updates the appointment, counter, history, and queue consistently.

### Module 10 - Waiting-time estimation and dynamic redistribution

**Dependencies:** 08-09. **Source:** Section 4.

- Implement a baseline estimator using work ahead, service durations, compatible active counters, and known priority.
- Use configured average duration until enough completed-service history exists; document the historical averaging window.
- Improve the baseline with current in-service remaining time and unequal service lengths where reliable data exists.
- Recompute when queue order, service completion, staff availability, or counter status changes.
- Redistribute waiting customers when counters pause/close, respecting service compatibility and priority.
- Return an approximate estimate with its update timestamp; return an explicit unavailable estimate when capacity is zero.

**Acceptance:** The PDF's simple example can yield approximately 10 minutes for 5 people at 4 minutes each with 2 equivalent counters. Closing a compatible counter updates estimates; no division by zero occurs. Estimates never become negative or use incompatible counters.

### Module 11 - Realtime tracking and public counter display

**Dependencies:** 08-10. **Source:** Sections 3, 7, and 11.

- Show a customer's token, service, position, people ahead, estimated wait, status, and called counter.
- Publish committed queue/counter events to authorized realtime subscriptions.
- Provide a counter-display view for called token numbers and destinations without customer contact details.
- Reconnect and refetch authoritative snapshots after network loss; provide fallback refresh.
- Include version/sequence information or an equivalent mechanism to handle stale and duplicate events.

**Acceptance:** Calling/completing/pausing updates customer and display views without a manual page reload during normal connectivity. Reconnection corrects stale state. Public displays expose no private appointment details.

### Module 12 - Notifications and scheduled jobs

**Dependencies:** 06-11. **Source:** Sections 3, 7, and 10.

- Notify for appointment confirmation, reminders, approaching turn, counter calls, reschedule, delay, and cancellation.
- Build a persistent in-app notification inbox with read/unread state.
- Implement configurable email delivery; SMS is an optional adapter.
- Schedule reminder, check-in expiry, and delivery jobs with retries and duplicate prevention.
- Use a transactional event/outbox or equivalent reliable handoff so notifications follow successful domain commits.
- Record delivery status and failures without rolling back successful bookings or service operations.

**Acceptance:** Each committed event produces the intended notification once under normal operation. Rescheduled/cancelled appointments invalidate obsolete reminders. Provider failure is visible and retryable. Recall can produce a fresh call notification.

### Module 13 - Customer portal, search, and history

**Dependencies:** 06-12. **Source:** Sections 2, 9, and 10.

- Assemble a responsive customer dashboard for booking, walk-ins, active visits, notifications, and history.
- Search/filter departments, services, dates, available appointments, and appointment status.
- Provide cancel/reschedule/check-in actions only when permitted by current rules.
- Show appointment history, token history, and meaningful state explanations.
- Include loading, empty, validation, booking-conflict, offline, and access-denied states.
- Support keyboard navigation, readable status text, and responsive layouts as engineering quality requirements.

**Acceptance:** A customer completes both appointment and walk-in journeys on desktop/mobile widths and can recover from a full slot or connection interruption without duplicate records.

### Module 14 - Manager and administrator dashboards

**Dependencies:** 03-04 and 09-12. **Source:** Sections 2 and 9.

- Provide department-scoped manager views and organization-wide administrator views.
- Show today's appointments, walk-ins, currently waiting customers, active counters, completed services, and missed appointments.
- Display average waiting time, average service duration, busiest departments/services, and peak visiting hours.
- Add charts/filters for waiting time by department, hourly queue length, staff workload, cancellations, no-shows, and daily/weekly trends.
- Separate observed waiting times from predicted waits. Compute observed wait from queue-entry/eligibility policy to service start and document the exact definition.
- Define denominators for cancellation/no-show rates, completion counts, date boundaries, and whether active means Available plus Busy.

**Acceptance:** Dashboard totals reconcile with database records for the selected scope/date. Role scoping is enforced on API queries. Empty datasets show sensible values rather than invalid averages.

### Module 15 - Audit logs, validation, and operational safeguards

**Dependencies:** Cross-cutting from 02 onward; finish after 14. **Source:** Section 10; supporting engineering requirements.

- Record staff/admin actions and appointment/token state changes with actor, entity, timestamp, and relevant changes.
- Centralize input validation, error codes, access checks, safe error messages, and request correlation.
- Handle booking conflicts, unavailable services, missing counters, duplicate requests, invalid transitions, and background-job failures.
- Add appropriate authentication/API rate limits and ensure sensitive information is not exposed in logs.
- Preserve history and define data retention, backups, and restore procedures.

**Acceptance:** Important actions are traceable. Validation cannot be bypassed through direct API calls. Failure paths leave no partially reserved capacity or partially completed service state.

### Module 16 - Optional AI enhancements

**Dependencies:** Reliable historical data from 09 and 14. **Source:** Section 11 and page 8. **Priority:** Optional.

Choose enhancements only after the complete core workflow works:

| Feature | Inputs and deliverable |
| --- | --- |
| Waiting-time prediction | Historical service times, live queue, counters; compare predictions against the baseline estimator. |
| Peak-hour prediction | Historical arrival timestamps; predict busy hours/days by department. |
| No-show prediction | Prior appointment outcomes; estimate risk without automatically denying service. |
| Staff recommendations | Expected demand and service capacity; recommend staffing/counter counts. |
| Demand forecasting | Service/date history; predict upcoming demand. |
| Queue optimization | Compatible counters, priority, queue workload; propose assignments and compare observed waiting outcomes. |
| Management insights | Measured analytics; produce concise explanations grounded in available data. |

**Acceptance:** Report data source, method, evaluation, and limitations. Provide a deterministic fallback when data/model access is unavailable. Label simulated/demo predictions clearly. Do not present a fixed formula as a trained AI model.

### Module 17 - Integration, quality verification, and release

**Dependencies:** Core modules 01-15. **Source:** Section 11; engineering release work.

- Run unit tests for domain rules, integration tests against a database, and end-to-end tests for real user journeys.
- Verify concurrent booking, token issuance, call-next, check-in/expiry, and rescheduling behavior.
- Verify authorization boundaries, timezone/day reset, counter redistribution, notification retries, and realtime recovery.
- Prepare production configuration, migrations, secure transport, health checks, worker startup, backup/restore, and rollback instructions.
- Deploy the responsive application for a complete demonstration; document any provider credentials or services required.
- Verify customer, staff, manager, administrator, and public-display journeys on the deployed environment.

**Acceptance:** Core acceptance criteria pass, persisted data survives restart, deployment is reproducible, and the demonstrated behavior uses real backend records rather than static UI values.

### Module 18 - Documentation and submission package

**Dependencies:** 17; document optional AI only if implemented. **Source:** Section 12.

- Replace provisional architecture/setup notes with the actual folder structure, commands, environment variables, and implemented features.
- Record a short demo covering booking, walk-in tokens, live queue, waiting estimates, staff/counter workflow, calling, check-in/completion, and analytics.
- Supply at least one required access option: GitHub repository or working deployed application link. Both are useful; the PDF permits either. A native mobile solution may provide APK/installation/testing access.
- Produce a separate PDF or Word project explanation showing important folders/files, their purposes, appointment/queue logic locations, intelligent-feature locations, and frontend/backend/database connections.
- Include demo instructions and test accounts through an appropriate delivery channel; never publish production passwords.

**Acceptance:** The evaluator can access the project, reproduce or test the demonstrated journeys, and identify where the main logic is implemented from the explanation document.

## Database implementation checklist

The PDF lists possible fields for Users, Services, Appointments, Tokens, and Counters. Extend them to implement the workflows above; exact names remain an implementation choice.

| Table/group | Purpose and important fields |
| --- | --- |
| users, roles, permissions | Identity, contact details, role/scope, account status, secure credentials. |
| departments, organization_settings | Organizational structure, timezone, inherited policies. |
| services | Department, name, duration, active status, token prefix, service rules. |
| staff_assignments, shifts | Staff department/service/counter scope and working availability. |
| counters, counter_services | Counter state, compatible services, assigned staff, current service. |
| schedules, breaks, date_overrides | Working windows, exceptions, and appointment availability. |
| slots/reservations | Capacity and occupied time/resource intervals; enforce transactional booking. |
| appointments | User, service, reference, start/end, status, check-in, cancellation/reschedule linkage. |
| tokens, token_sequences | Service-day token reference, user, optional appointment link, eligibility, priority, state, timestamps. |
| service_sessions | Token, staff, counter, call/start/completion times and outcome. |
| appointment_events, queue_events | State history and recorded reasons/actors. |
| notifications, delivery_attempts, outbox | Notification content/status, reliable delivery and retry coordination. |
| audit_logs | Authorized operational/configuration actions. |

Add foreign keys, valid-state checks, service-day token uniqueness, appointment-reference uniqueness, and appropriate indexes. Enforce one token per appointment and one active service per counter/token. Enforce configurable capacity and user limits through transactional logic; application-side counts alone are insufficient under concurrency.

Queue position and estimated wait are derived values. If cached, store an update/version marker and recompute them when relevant state changes rather than treating the cache as authoritative.

## API and screen coverage

Endpoint names below are examples, not a finalized API contract. Use authorized command endpoints for state transitions rather than allowing unrestricted status editing.

| Domain | API operations | Screens |
| --- | --- | --- |
| Identity | Register, login/logout, profile, manage users/roles | Sign-in, registration, profile, user administration |
| Catalog | Search/manage departments and services | Service directory, service settings |
| Capacity | Availability, schedules, capacity/rules | Slot picker, schedule/capacity editor |
| Appointments | Book, detail/history, cancel, reschedule, check-in | Booking wizard, appointment detail, history |
| Queue | Join, own token/status, waiting list, authorized cancellation | Walk-in form, live token tracker |
| Staff workflow | Call-next, recall, skip, mark missed, start, complete | Staff console |
| Resources | Staff/shift/counter assignments, pause/resume/status | Staff and counter management |
| Notifications | List, mark read, delivery settings | Notification inbox/settings |
| Reporting | Scoped dashboard totals, trends, audit search | Manager/admin dashboard and activity views |
| Realtime | Authorized snapshots/subscriptions and public display data | Live tracker and counter display |

Publish the final request/response schemas, pagination, validation errors, authorization rules, and idempotency behavior in `docs/api.md`.

## State transition contract

- **Appointment happy path:** Booked -> Confirmed -> Checked In -> Waiting -> In Service -> Completed.
- **Appointment alternatives:** Cancelled, Missed, Rescheduled, and Delayed need explicit permitted origins, actor permissions, and effects on capacity/tokens.
- **Token happy path:** Waiting -> Called -> In Service -> Completed.
- **Token alternatives:** Called -> Skipped or Missed; Skipped -> Waiting through authorized recall; eligible pre-service tokens may be Cancelled. Recall of an already Called token records another call event without duplicating its service session.
- **Counter:** Available -> Busy when claimed; Busy -> Available after completion. Break/Closed stops new assignments. Transitioning during active service requires an explicit interruption procedure.

Rescheduling should preserve the original appointment's history and link its replacement. Treat delay as a documented timing change or permitted state that can resume the workflow; never make it an irreversible dead end. Encode the full transition table and side effects before implementation.

## Delivery phases and dependency order

| Phase | Modules | Exit milestone |
| --- | --- | --- |
| A - Foundation | 01-04 | Working authentication, role scopes, services, staff, counters, and demo data. |
| B - Booking | 05-06 | Capacity-safe booking, cancellation, and rescheduling with history. |
| C - Queue operations | 07-10 | Both visit types enter the queue; staff calls/serves customers; counters and wait estimates react correctly. Modules 07-08 require coordinated integration. |
| D - Complete experience | 11-15 | Realtime views, notifications, customer portal, scoped dashboards, logs, and error handling. Audit/validation work starts earlier and is verified here. |
| E - Release and submission | 17-18 | Verified deployed workflow, source/access link, video, and explanation document. |
| Optional extension | 16 | Evaluated AI enhancement added without weakening core behavior. |

Do not defer capacity protection, access control, or atomic token claims to the release phase. Build and verify them within the modules that introduce the corresponding operations.

## End-to-end acceptance scenarios

1. **Scheduled visit:** Customer books an available slot, receives confirmation/reminder, checks in, sees live status, is called to a compatible counter, receives service, and sees completion/history; analytics update.
2. **Walk-in visit:** Customer obtains a unique token, sees people ahead/wait, receives an approaching-turn alert and call, completes service, and appears in walk-in analytics.
3. **Booking contention:** Two users attempt the last place concurrently; only permitted capacity succeeds, and the rejected user sees a useful availability error.
4. **Rescheduling failure:** The replacement slot becomes full; the original booking remains valid with no leaked reservation.
5. **Duplicate requests:** Repeated booking, join, check-in, call, and completion requests do not create duplicate bookings, tokens, or service sessions.
6. **Counter pause:** An available counter pauses/closes; eligible waiting work moves to compatible counters and estimates update. In-service work follows the explicit interruption policy.
7. **No active counter:** Customers see the queue's paused/unavailable state with no fabricated numeric estimate.
8. **No-show:** An unchecked-in appointment expires correctly. A called walk-in can be recalled/skipped/marked missed with preserved history.
9. **Mixed priority:** Checked-in appointments and walk-ins follow the configured order; the fairness rule prevents walk-ins from being indefinitely ignored.
10. **Authorization:** A customer cannot read another customer's records; staff and managers cannot operate another department's resources; public displays reveal only safe token data.
11. **Connection/provider failure:** Realtime reconnect restores the correct queue; failed email delivery retries without undoing a successful booking or sending obsolete reminders.
12. **Reporting:** Dashboard totals and measured average times match known seeded/completed visits, with correct scope and local-day boundaries.
13. **Restart:** Persisted appointments/tokens survive restart; pending background work resumes without duplicate actions.
14. **Submission:** The video covers every listed demonstration feature, the access link works, and the PDF/Word explanation identifies actual implementation files.

## Requirement traceability

| PDF section | Pages | Plan coverage |
| --- | --- | --- |
| 1. Project Overview & Real-World Problem | 1 | Purpose, workflows, Modules 06-14 |
| 2. Main Users & Their Roles | 2 | Roles, Modules 02-04, 09, 13-14 |
| 3. Appointment & Digital Queue Workflow | 3 | Modules 06-09, 11 |
| 4. Smart Waiting Time & Queue Management | 4 | Modules 08, 10-11 |
| 5. Appointment Slot & Capacity Management | 4 | Modules 03, 05-06 |
| 6. Counter, Staff & Service Management | 5 | Modules 03-04, 09-10 |
| 7. Token Calling, Check-In & No-Show Handling | 5 | Modules 07, 09, 11-12 |
| 8. Data Model & System Architecture | 6 | Architecture, database checklist, Modules 01-15 |
| 9. Search, Dashboard & Analytics | 6 | Modules 13-14 |
| 10. Notifications, Rules & Error Handling | 7 | Policies, Modules 02-03, 06-08, 12, 15 |
| 11. Final Project Vision & Additional AI Features | 7-8 | Connected workflow, Module 16, release acceptance |
| 12. Submission Method | 8 | Module 18 |

## Definition of complete

- [ ] Both appointment and walk-in journeys work end to end using persistent backend data.
- [ ] All four roles have working screens and enforced backend permissions.
- [ ] Slot/daily capacity, user limits, unique tokens, and concurrent staff claims are protected.
- [ ] Check-in, priority, skip/recall, cancellation, rescheduling, delay, and no-show rules are explicit and implemented.
- [ ] Counter/staff changes adjust compatible queues and waiting estimates.
- [ ] Live status, notifications, personal history, staff logs, and dashboards work together.
- [ ] Required end-to-end, concurrency, and permission scenarios pass.
- [ ] Deployment, backup/restore, configuration, and local setup are documented and verified.
- [ ] Demonstration video, access link, and separate PDF/Word project explanation are ready.
- [ ] Any optional AI feature is clearly identified and evaluated; absence of AI does not prevent core completion.

The next development action is Module 01: finalize the stack and business-policy defaults, then scaffold the project and verify reproducible startup before implementing accounts and permissions.
