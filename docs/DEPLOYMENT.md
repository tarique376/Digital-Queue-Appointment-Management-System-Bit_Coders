# Deployment and operation

1. Provision Neon PostgreSQL, put its SSL-enabled pooled URL in the host's DATABASE_URL, and set an actual HTTPS APP_URL.
2. Install locked dependencies, typecheck, test, and build. Run SQL migrations as a controlled release command.
3. Start the Node server with `npm start`, or deploy to a host supporting Next.js route handlers and PostgreSQL TCP connections. Hosting accounts/plan quotas are chosen separately; this repository does not automatically publish a site.
4. Seed only an empty demo database. Replace shared demo credentials with individual real accounts before public operation.
5. Run `npm run jobs` as a separate supervised process or schedule authenticated POST `/api/jobs` every minute. A public GET-only scheduler is insufficient.
6. Configure SMTP if email/reset delivery is needed, then verify real recipient delivery.
7. Smoke-test health, sign-in, competing bookings, calling, completion, display, reporting, and worker expiry on the deployed origin.

## Connection and security

The pg pool opens up to five connections per process. Use Neon's pooled URL and retain its SSL options. Account for application process count when selecting connection limits. A migration role needs schema creation privileges; use a separate runtime role when appropriate.

Secure cookies are enabled in production. APP_URL controls accepted browser origins. Never commit `.env.local`, place secrets in NEXT_PUBLIC variables, or log database/session/reset credentials. Production cannot use the development-only test database.

## Backups, recovery, and rollback

Use provider backup/restore features or protected PostgreSQL export tools. Keep encrypted exports outside the repository and restore into an isolated replacement database before trusting the procedure. Verify migrations, row counts, account access, active visits, token sequences, and counters after restoration.

Keep the prior application build and a pre-migration backup. SQL migrations are forward-only. Roll back application code only if it remains compatible with the migrated schema; otherwise issue a forward repair or planned replacement-database restore. Do not reverse live schema changes blindly.

## Operational limits

Mutations use one organization lock for correctness; benchmark before large-scale use. State queries are not paginated. Email batches process 20 messages with at-least-once retry semantics. Live tracking refreshes every five seconds. Capacity is conservative and hourly historical queues are approximate. Exact definitions are in BUSINESS_RULES.md.
