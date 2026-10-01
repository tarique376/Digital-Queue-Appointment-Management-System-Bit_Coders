# API contract

Next.js route handlers return no-store JSON. Protected requests require the HTTP-only `queueflow_session` cookie. Browser POSTs require `Origin` to match APP_URL. DATABASE_URL is server-only.

| Method / route | Behavior |
| --- | --- |
| POST `/api/auth` | Actions login/register/logout/forgot/reset. Login uses email/password; register adds name and optional phone; reset uses token/password. |
| GET `/api/state?day=YYYY-MM-DD` | Scoped catalog, visits, queue, notifications, management data, and selected-date reports. |
| GET `/api/slots?service=UUID&day=YYYY-MM-DD` | `{slots:[{start,end,available,capacity}]}`; timestamps use UTC ISO. |
| POST `/api/commands` | `{action,input,key}`; key is a per-user operation UUID for retry deduplication. |
| GET `/api/display` | Safe current call/service data and counter destinations; public. |
| GET `/api/health` | 200 ok or 503 setup-required/database-unavailable. |
| POST `/api/jobs` | Background jobs; requires Authorization: Bearer CRON_SECRET. |

## Business commands

| Action | Input |
| --- | --- |
| book | serviceId, start |
| cancel, checkin | appointmentId |
| reschedule, delay | appointmentId, start |
| join | serviceId |
| cancelToken, start, complete, skip, recall, miss | tokenId |
| call | counterId |
| counterStatus | counterId, status (AVAILABLE/BREAK/CLOSED) |
| department | Optional id; name/active, opens/closes, break_start/break_end, workdays, capacity, daily_limit, user_daily_limit, token_limit, checkin_before/checkin_after, cancel_minutes, horizon_days, fairness_minutes, response_minutes, accept_paused |
| service | Optional id; department_id, name, duration, prefix, active |
| counter | Optional id; department_id, name, staff_id nullable, service_ids UUID array, shift_start/shift_end |
| user | Optional id; name, email, phone, role, department_id nullable, active, optional password (required on creation) |
| closure / deleteClosure | department_id/day/reason / id |
| notification | id (mark the owner's notification read) |
| settings | name, IANA timezone (admin only) |

Book/join require a customer. Staff operations enforce assignment and department access. Configuration requires manager/admin; only admins create departments/change organization settings or privileged roles. Owner or scoped staff may act on appointments subject to business policy. Delay requires manager/admin.

Validators in domain.ts define complete contracts and numeric bounds. Dates are YYYY-MM-DD; clocks HH:mm; start timestamps ISO with an offset. Password creation/reset requires 12-128 characters. Errors use `{error:message}` with statuses 400 validation/transition, 401 session/login, 403 permissions/origin, 404 missing record, 409 conflict, 413 size, 429 auth attempts, 503 setup, and 500 unexpected failure.

The current state API is not paginated. It returns active visits plus recent past appointments (90 days), tokens (30 days), and selected report history. Notifications/events return the latest 100. Add cursor pagination and retention controls for larger deployments.
