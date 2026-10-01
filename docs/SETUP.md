# Start QueueFlow with Next.js and Neon PostgreSQL

For a detailed Windows walkthrough with explanations and expected results, read the [beginner guide](./BEGINNER_GUIDE.md). The steps below are the shorter technical reference.

## 1. Create the free online database

1. Open [Neon](https://neon.com/) and sign up/sign in.
2. Create a PostgreSQL project on the **Free** plan. Choose a nearby region.
3. Open **Connect / Connection details**, select your database and role, and copy the pooled PostgreSQL connection string. Keep its SSL options.
4. Put the string in `.env.local` in this project folder:

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require"
```

Do not commit this file or paste the URL into public messages. Free-plan quotas can change; check [Neon's current pricing](https://neon.com/pricing) before provisioning. No hosted database is provisioned automatically by this repository.

## 2. Configure the application

Use Node.js 20.9 or later, as required by the installed Next.js version. This project was built using Node.js 24.

If `.env.local` does not exist, copy `.env.example` to `.env.local`. Set `DATABASE_URL`, `APP_URL`, `SEED_PASSWORD` (at least 12 characters), and `CRON_SECRET` (at least 32 random characters). If a local configuration file was created during development, it already contains generated seed/job secrets; retain them or replace them privately.

```powershell
cd D:\Dileep\DigitalQueueAppointment
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

Before `npm ci`, stop any running app, worker, and tests with Ctrl+C. On Windows, they can lock `esbuild.exe` and cause `EPERM`; a failed install can leave `tsx` missing. Rerun installation after stopping the processes, and continue only once it succeeds. Installation is not part of everyday startup.

Open [http://localhost:3000](http://localhost:3000). Keep `APP_URL=http://localhost:3000` when using this address; the API checks the request origin.

The seed is non-destructive: it creates demo configuration only if there are no user accounts. Migrations run once and are tracked in the database. The database role needs permission to create tables/indexes and run migrations.

## 3. Sign in and exercise each role

All seeded accounts initially use the private `SEED_PASSWORD` value in `.env.local`:

| Account | Role |
| --- | --- |
| `admin@queueflow.local` | Administrator |
| `manager@queueflow.local` | Student Affairs manager |
| `staff@queueflow.local` | Counter 01 staff |
| `staff2@queueflow.local` | Counter 02 staff |
| `examstaff@queueflow.local` | Examination Office staff |
| `customer@queueflow.local` | Customer |

Register additional customer accounts through the sign-up form. Admins/managers can create staff accounts through Management. Production accounts should use individual passwords and real email addresses; `.local` demo addresses cannot receive real email.

Seeded departments operate daily, 09:00-17:00 in Asia/Karachi with a 13:00-14:00 break. Counter shifts follow 09:00-17:00. Change these through Management for your organization. Walk-ins and calling are validated against working hours; appointment slot availability uses future configured schedules rather than a counter's temporary current break status.

## 4. Run background work

In a second terminal, run:

```powershell
npm run jobs
```

This processes appointment reminders, check-in expiry, approaching-turn alerts, end-of-day walk-in expiry, session cleanup, and email retries every minute. The app's live views refresh every five seconds through authenticated polling. Counter calling notifications are created immediately; scheduled reminder/expiry behavior requires the worker or equivalent scheduling.

For hosted deployments, schedule **POST `/api/jobs`** every minute with `Authorization: Bearer <CRON_SECRET>` using a trusted scheduler, or host the long-running worker. A plain public GET scheduler is insufficient; it must support the POST and authorization header.

## 5. Optional email

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` in the server environment. Port 465 uses implicit TLS; port 587 uses the transport's STARTTLS behavior. With no SMTP configuration, in-app notifications work and email delivery is marked disabled. Password-reset email requires a working transport and worker. SMS is optional and is not implemented.

Email delivery retries up to five attempts. Delivery is at least once: a process crash between provider acceptance and recording success can cause a duplicate email. The inbox uses unique event keys to avoid duplicate application notifications.

## 6. Verify and build

```powershell
npm run typecheck
npm test
npm run build
npm start
```

`npm test` uses isolated PGlite PostgreSQL instances and never touches `DATABASE_URL`. Real hosted PostgreSQL connectivity and lock behavior must also be checked against your Neon development database. Browser checks use a separate test-only embedded PostgreSQL fixture; see `docs/TESTING.md`.

## 7. Deployment

Follow [DEPLOYMENT.md](./DEPLOYMENT.md). A connected database alone does not publish the application. The Next.js server and scheduled jobs also need hosting.

## Troubleshooting

- **Database setup message:** Ensure `.env.local` contains an actual `DATABASE_URL`, run migrations, and restart the dev server after changing environment variables.
- **Database unavailable:** Check Neon project status, connection credentials, network access, and SSL options. Do not remove SSL requirements for hosted connections.
- **No appointment times:** Select an active service, a date inside the booking horizon and working days, and ensure assigned staff/counters support the service. Breaks/closures and occupied capacity remove availability.
- **No active counter:** Assign active department staff, enable a compatible counter, and check its shift/department hours. Managers can explicitly allow tokens during paused service.
- **Check-in rejected:** The department's arrival window is enforced. A booking is not eligible for calling before its scheduled start.
- **Cancel/reschedule rejected:** The configured cutoff has passed or the appointment has already entered the queue.
- **Missed action rejected:** Wait for the configured customer response window after the latest call/recall.
- **Origin rejected:** Use the exact origin configured in `APP_URL` (scheme, host, and port).
- **No reminders/expiry:** Start `npm run jobs` or configure the authenticated scheduled endpoint.
- **No email/reset link:** Configure SMTP, use a real email address, and run the worker. In-app notifications do not require SMTP.
