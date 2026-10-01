# Implemented business rules

## Calendar and capacity

- The organization timezone defaults to Asia/Karachi. PostgreSQL timestamps are timezone-aware; local dates govern schedules, sequences, and limits.
- Service duration is both slot step and reserved duration. Windows begin at department opening and exclude breaks, closed dates, past starts, and dates outside the horizon.
- Capacity is shared across department services. Available places equal the smaller of configured department capacity and compatible staffed counters, minus all overlapping active department bookings. This conservative calculation protects shared counters but can underuse capacity compared with an optimal assignment algorithm.
- Future slots use configured staff assignments/shifts, irrespective of a counter's temporary current break state. Live queues use current state and shift.
- Active booking states are BOOKED, CONFIRMED, CHECKED_IN, WAITING, IN_SERVICE, and DELAYED. Cancelled/missed/completed/rescheduled records do not reserve future capacity.
- User overlap checks span the organization. User/day and active-token limits use the selected department's rule.
- All business commands lock the settings row inside the transaction, serializing checks and writes across server processes. Reads do not take the lock.

## Appointment lifecycle

Bookings enter CONFIRMED directly. BOOKED is supported for a future pending-confirmation workflow. Check-in transitions through CHECKED_IN to WAITING and creates one unique linked token. Tokens are callable no earlier than scheduled appointment start. Service start/completion update the linked appointment to IN_SERVICE/COMPLETED.

Check-in is inclusive within configured minutes before/after start. Unchecked-in records become MISSED after the deadline through the worker. Cancellation/rescheduling require pre-check-in state and the configured cutoff. Rescheduling creates a replacement linked through `replaces_id`, retaining the old RESCHEDULED record. A failed replacement rolls back and preserves the original booking.

Managers may delay pre-check-in appointments to valid available generated slots; capacity and user limits still apply. Closures/schedule edits block future bookings without silently changing existing visits. Review and explicitly move affected visits.

## Queue and counters

- Display tokens use a service prefix and daily sequence. Service/day/UUID distinguish matching prefixes or repeated numbers on different days.
- Walk-ins require open service hours outside breaks/closures and active compatible counters unless accepting paused queues is enabled.
- WAITING/CALLED/IN_SERVICE/SKIPPED count toward active-token limits across the organization.
- Due appointments precede ordinary walk-ins. Walk-ins older than the configurable fairness threshold rise ahead of appointments. Within classes, eligibility, creation time, and UUID establish deterministic order.
- Call Next claims one eligible compatible token and marks the counter BUSY atomically. A partial unique database index protects one active token per counter. Staff identity is snapshotted at claim time for reporting.
- CALLED -> IN_SERVICE -> COMPLETED. Only valid transitions are accepted.
- Skip changes CALLED to SKIPPED and frees the counter. Recall returns a skipped token to WAITING with renewed eligibility; age still contributes to fairness. Recalling CALLED notifies again and resets the no-response window.
- Missed is permitted for CALLED/SKIPPED only after the configured response window. Owners may cancel WAITING/SKIPPED tokens.
- Prior-day unattended walk-in WAITING/SKIPPED records expire through the worker. Active called/in-service work requires staff resolution.
- Busy counters cannot pause or change staff assignments until the current service is resolved. Manual in-service transfers are not exposed.

## Estimation, reporting, and notifications

Estimates use eligible competing work across compatible counters plus remaining active service time. The duration fallback is the token's snapshotted service duration. With five observations, use up to 30 recent completed service durations. Zero active capacity returns no numeric estimate. This deterministic algorithm is not a trained AI model.

Observed wait is service start minus the later of token creation/eligibility. Service duration is completion minus start. Report-day appointments use scheduled start dates; visitor/completion counts use selected-day token arrivals. Rate denominators include all appointments scheduled that date, including retained reschedule source records. Zero denominators return zero. Waiting and active counter totals are current values. Staff workload uses the recorded serving staff.

Hourly queue counts are approximate half-hour snapshots from token/service timestamps, excluding terminal cancellations/no-shows/skipped entries; they are not full event reconstructions.

In-app notifications use unique event keys. Optional email is at least once, retries five times, and suppresses queued obsolete booking reminders. A provider handoff interrupted before recording success may duplicate mail. Password resets require SMTP plus worker delivery and use hashed single-use 30-minute tokens.

## Permissions

Customers access their own records; staff use assigned counters/services in their department; managers administer their department; administrators span the organization. Public signup cannot choose privileged roles. Managers manage only their own staff. Admins cannot edit their own permissions/active status through Management. Account edits revoke existing sessions; disabled/reassigned staff detach from counters after active-service checks.

The public queue display excludes visitor identities, contacts, and private appointment information. Browser POST origins must match APP_URL. Each command re-reads current account/role under the business lock. Repeating the same user/action/request UUID returns the stored result.
