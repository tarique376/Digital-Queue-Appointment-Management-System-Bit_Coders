# QueueFlow: complete beginner setup guide

This guide is for Windows and PowerShell. It uses the completed project in `D:\Dileep\DigitalQueueAppointment`. If you move the project, replace that path in every command with your new folder.

Your Neon database has already been connected, migrated, and seeded. On this computer, start with **Section 8: everyday startup**. Sections 1–7 explain how to set up the project on a new computer or with a new database.

## 1. Understand what you are running

| Part | What it does | Where it runs |
| --- | --- | --- |
| Next.js application | Website, login, appointments, queue, management, and API | Your computer while developing |
| Neon PostgreSQL | Stores accounts, bookings, tokens, settings, and history | Online in your Neon account |
| Background worker | Processes reminders, missed appointments, expiry, and optional email | A second terminal on your computer |
| Browser | Displays and controls the website | Your computer |

You need internet access to use the online database. You do not need to install PostgreSQL locally. `localhost` means your own computer: a Neon connection does not make the website publicly accessible.

## 2. Install the required tools

1. Download **Node.js 24 LTS** from [the official Node.js download page](https://nodejs.org/en/download). Choose the Windows installer for your computer and keep the default installation options. npm is included.
2. Install a code editor if desired, such as Visual Studio Code. You can also edit configuration with Notepad.
3. Use Chrome, Edge, or another modern browser.
4. Close and reopen PowerShell after installing Node.js.

Open PowerShell from the Windows Start menu. Run each line below separately, pressing Enter after each:

```powershell
node --version
npm.cmd --version
```

Both should print a version number. This project was verified with Node.js 24. The installed Next.js version requires at least Node.js 20.9; use Node.js 24 for this guide. See [Next.js installation requirements](https://nextjs.org/docs/app/getting-started/installation).

The commands use `npm.cmd` because it works even when PowerShell blocks the `npm.ps1` script. Do not type the prompt text, such as `PS D:\...>`, or the Markdown backticks surrounding examples.

## 3. Open the correct project folder

```powershell
Set-Location 'D:\Dileep\DigitalQueueAppointment'
Get-Location
Test-Path package.json
```

The location should be your project folder, and the last command should print `True`. If it prints `False`, you are in the wrong folder. Open the folder containing `package.json`, `src`, `database`, and `docs`.

Use the existing project files. You do not need to run `create-next-app` or recreate the application. On another computer, transfer the source files and `package-lock.json`; dependencies can be installed there. Transfer private settings separately only if that computer should access the same database.

## 4. Create or choose your Neon database

**Already connected on this computer? Keep the existing URL and skip this section.**

For a new database:

1. Sign in at [Neon](https://neon.com/).
2. Create a PostgreSQL project using the Free plan if it meets your needs. Choose a nearby region and note your project, branch, and database names.
3. Open the project's connection dialog, commonly labelled **Connect**.
4. Choose the intended database and database role. Enable connection pooling and copy the PostgreSQL connection string. A pooled hostname usually contains `-pooler`.
5. Keep all connection options supplied by Neon, including SSL and channel-binding options if present.

The URL contains a database password. Paste it into the private configuration file in the next section. Consult [Neon's connection documentation](https://neon.com/docs/get-started-with-neon/connect-neon). Plan quotas and console labels can change; review [current pricing](https://neon.com/pricing) rather than assuming unlimited free usage.

An empty database is suitable for first-time setup. Choosing another database later does not automatically copy your existing application data.

## 5. Configure the private environment file

`.env.example` is a shareable template. `.env.local` contains your actual private settings. The application and setup scripts read `.env.local` before `.env`, so a blank value in `.env.local` can override a correct value in `.env`.

Create `.env.local` **only if it does not already exist**:

```powershell
if (-not (Test-Path '.env.local')) {
  Copy-Item '.env.example' '.env.local'
}
notepad.exe .env.local
```

Use the following format, replacing the placeholders privately:

```dotenv
DATABASE_URL="PASTE_YOUR_COMPLETE_NEON_POSTGRESQL_URL_HERE"
APP_URL=http://localhost:3000
CRON_SECRET="PASTE_A_GENERATED_SECRET_HERE"
SEED_PASSWORD="CHOOSE_A_UNIQUE_PASSWORD_OF_AT_LEAST_12_CHARACTERS"
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM="QueueFlow <notifications@example.com>"
```

For a new configuration, generate a job secret in PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the generated value into `CRON_SECRET`. Keep existing generated secrets on an already configured installation. `SEED_PASSWORD` is the initial password for the demo accounts; choose at least 12 characters. Double quotes are helpful for values with spaces or special characters. Save the file as exactly `.env.local`, not `.env.local.txt`.

Important details:

- Keep the actual database URL only in private settings or your host's secret environment variables. Do not put it in `.env.example`, screenshots, README files, or GitHub.
- Use `APP_URL=http://localhost:3000` and open that exact browser address during development. Changing the port or using `127.0.0.1` requires a matching `APP_URL`.
- Leave SMTP settings empty initially. In-app notifications work without email. Password-reset email needs SMTP and the worker.
- Changing `SEED_PASSWORD` later does **not** change passwords already saved in the database. Keep the original value for existing demo accounts, or use an appropriate account password-reset procedure.
- Never give these secrets a `NEXT_PUBLIC_` prefix; they belong on the server.

## 6. Install dependencies and prepare the database

**Before installing, stop any running website, worker, or tests with Ctrl+C in their terminals.** This includes processes started during a previous setup session. On Windows, a running worker locks `esbuild.exe`, causing `npm ci` to fail with `EPERM`. Because the install has already started replacing packages, the next migration command may then report that `tsx` is missing. Stop the processes and rerun the installation successfully before migrating. You do not need Administrator mode for this file-lock problem.

Run these commands one at a time from the project folder:

```powershell
npm.cmd ci
npm.cmd run db:migrate
npm.cmd run db:seed
```

Wait for each command to finish before running the next. Stop and resolve any error before continuing.

| Command | Purpose | Expected result |
| --- | --- | --- |
| `npm.cmd ci` | Installs the versions recorded in `package-lock.json` | Installation completes without an error |
| `npm.cmd run db:migrate` | Creates/updates application tables | New SQL files are applied; already-applied files are skipped |
| `npm.cmd run db:seed` | Creates example departments, services, counters, and accounts | First run creates 2 departments, 4 services, 3 counters, and 6 accounts |

On your already configured database, migrations report `Already applied` for existing SQL files and finish with `Database migrations complete.` Seeding should report `Seed skipped: accounts already exist.` That is expected. Seeding deliberately skips databases with existing users; it does not reset passwords or repair partially populated data.

`npm ci` replaces the dependency installation. Stop the application, worker, and test processes before rerunning it, because Windows can lock files they are using. Do not run competing package installations in this folder.

## 7. Start and check the application

In the first PowerShell window:

```powershell
Set-Location 'D:\Dileep\DigitalQueueAppointment'
npm.cmd run dev
```

Wait for a ready message showing `http://localhost:3000`. Keep this terminal open. It is the running server, so it will not return to an ordinary prompt until stopped.

Open a **second PowerShell window**:

```powershell
Set-Location 'D:\Dileep\DigitalQueueAppointment'
npm.cmd run jobs
```

Keep this window open too. The worker checks scheduled work about once a minute. `email: 'disabled'` is expected until SMTP is configured. Live screens refresh approximately every five seconds.

Open these addresses in your browser:

- Application: [http://localhost:3000](http://localhost:3000)
- Database health: [http://localhost:3000/api/health](http://localhost:3000/api/health)
- Public counter display: [http://localhost:3000/display](http://localhost:3000/display)

The health address should display `{"status":"ok"}`. This confirms the server can query the migrated database. It does not replace testing the booking and queue workflows.

## 8. Everyday startup and shutdown

After the first setup, you normally need only two terminals:

**Terminal 1: website**

```powershell
Set-Location 'D:\Dileep\DigitalQueueAppointment'
npm.cmd run dev
```

**Terminal 2: background work**

```powershell
Set-Location 'D:\Dileep\DigitalQueueAppointment'
npm.cmd run jobs
```

Open `http://localhost:3000`. Do not reinstall packages, recreate the Neon project, or reseed each day. Restart both processes after editing environment settings. When updating project files, install dependencies if needed and apply any new migrations before starting.

To stop, press **Ctrl+C** in each terminal. Closing the browser alone does not stop the server. Turning off the computer stops local processes, while stored records remain in Neon. If a server is already running, use it or stop it before launching another on the same port.

## 9. Sign in and try the complete workflow

All initially seeded accounts use the original private `SEED_PASSWORD` from `.env.local`:

| Email | Role and scope |
| --- | --- |
| `customer@queueflow.local` | Customer bookings, tokens, and history |
| `staff@queueflow.local` | Student Affairs, Counter 01 |
| `staff2@queueflow.local` | Student Affairs, Counter 02 |
| `examstaff@queueflow.local` | Examination Office, Counter 03 |
| `manager@queueflow.local` | Student Affairs management |
| `admin@queueflow.local` | Organization-wide administration |

Use a normal browser window for the customer and an InPrivate/Incognito window for staff. Their login sessions will stay separate. The demo `.local` addresses cannot receive real email.

### Walk-in demonstration

1. Sign in as the customer and select Student Affairs and an available service, such as Document verification.
2. Request a walk-in token. Read the token number, queue state, and waiting estimate.
3. In the separate browser session, sign in as `staff@queueflow.local` and open counter operations.
4. Ensure Counter 01 is serving, then call the next eligible token.
5. Observe the customer's notification and the public display.
6. Start service, then complete it. Check customer history and manager/admin reports.

Seeded departments and shifts run daily **09:00–17:00 Asia/Karachi**, with a department break **13:00–14:00**. Try this during working hours outside the break. Outside those hours, a manager/admin can configure the department schedule and counter shift together. Observe the configured rules rather than changing your computer clock.

### Appointment demonstration

1. As the customer, choose a service and a future available date/time, then confirm the appointment.
2. Check the booking in appointment history. Try rescheduling or cancelling a separate test booking before its configured cutoff.
3. For the appointment you will attend, check in during the department's allowed arrival window. Check-in produces the linked queue token.
4. Once its scheduled start is reached, staff can call the eligible token, start service, and complete it.
5. Check history, notifications, and reports. A future appointment is not immediately eligible for calling simply because it exists.

### Manager and administrator demonstration

Sign out and sign in as manager or administrator. Inspect Management, schedules, services, staff/counter assignments, Reports, and audit activity. The manager sees the assigned department; the administrator sees the organization. Configure the organization deliberately before inviting real customers. Changes to the Neon-backed app affect the shared database immediately.

## 10. Optional email notifications

Obtain SMTP settings from your email provider: host, port, username, password or app password, and an allowed sender address. Enter them privately in `.env.local`, replace the example `SMTP_FROM`, and restart the website and worker.

Port 465 uses implicit TLS; port 587 uses STARTTLS behavior. Follow the provider's settings rather than guessing. Register a customer with a real email address and verify delivery and password-reset email. Never test delivery with the seeded `.local` accounts. SMTP provider prices and authentication requirements are separate from Neon.

## 11. Check the installation

Open a third terminal in the project folder. Basic checks:

```powershell
npm.cmd run typecheck
npm.cmd test
```

TypeScript should finish without errors; domain tests should pass. Domain tests use isolated test databases and do not modify your Neon application data.

Optional browser checks using Chrome installed in its standard Windows location:

```powershell
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm.cmd run test:e2e
```

If Chrome is unavailable, install the test browser instead:

```powershell
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Browser tests use a separate test database and port 3100. The already-running local website can stay on port 3000. For additional hosted verification on a demo/development database, see [TESTING.md](./TESTING.md). `test:hosted` expects the existing demo passwords to match `SEED_PASSWORD` and the application to be running.

To check the production build, stop the development server first, then run:

```powershell
npm.cmd run build
```

A successful build does not publish the site. For everyday local login testing use `npm.cmd run dev`: production enables secure session cookies and expects HTTPS. Production startup is `npm.cmd start` on a properly configured HTTPS host.

## 12. Publish it later

Local setup is complete when both processes run and the workflows work. Public deployment is a separate step:

1. Choose a host that supports a Next.js server and PostgreSQL connections. This application needs server APIs; a static-file-only host is insufficient.
2. Publish source files using your chosen deployment workflow. Exclude private environment files, `node_modules`, and build/test output. Check `.env.example` contains placeholders only before sharing.
3. Configure private host environment variables, including `DATABASE_URL`, an HTTPS `APP_URL` matching the public website, and `CRON_SECRET`. Configure SMTP if required.
4. Install dependencies, run checks, apply migrations as a controlled release step, and build the application. Start it with the host's supported Next.js deployment flow or `npm start` for a Node server.
5. Run a supervised worker, or schedule **POST `/api/jobs` every minute** with `Authorization: Bearer <CRON_SECRET>`. A GET-only scheduler will not work. Never put the secret into a public URL.
6. Use individual real accounts and appropriate credentials before opening public access. Use a separate development database for future experiments.
7. Verify login, bookings, queue operations, health, notifications, and worker processing at the public HTTPS address. Configure backups and test recovery.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for operational details. Neon hosts the database; your website and worker still require hosting. Hosting and scheduler free-tier restrictions vary, so confirm them with the selected providers.

## 13. Common problems and fixes

| Symptom | What to do |
| --- | --- |
| `node` or `npm.cmd` is not recognized | Install Node.js, reopen PowerShell, and repeat the version checks. |
| PowerShell says scripts are disabled | Use the `npm.cmd` / `npx.cmd` commands in this guide. |
| `package.json` cannot be found | Change to the correct project folder and check `Test-Path package.json`. |
| `next` is not recognized or the Next.js package is missing | Stop app/worker/tests, run `npm.cmd ci`, then restart. |
| `EPERM` or a locked `esbuild.exe` during installation | Stop the project processes first. Close their terminals and retry `npm.cmd ci`. If the lock persists, reboot before reinstalling. |
| Port 3000 is in use | Use the existing project server or stop it with Ctrl+C. For an intentional port change, update `APP_URL` and run `npm.cmd run dev -- --port 3001`. |
| Setup-required or database-unavailable health response | Check the real URL in `.env.local`, Neon status, internet access, and SSL options; run migrations and restart. |
| Migration fails | Confirm you selected the correct database and the role has table/index creation permissions. Do not delete existing tables as a quick fix. |
| Seed is skipped | Existing users are already present. This is normal and does not change their passwords. |
| Demo login fails | Use the original seeded password. Editing `SEED_PASSWORD` alone does not update database accounts. Check email spelling. |
| Request origin is not allowed | Match the exact browser scheme, hostname, and port to `APP_URL`, then restart. |
| Production login does not persist over local HTTP | Use `npm.cmd run dev` locally; production needs HTTPS for secure session cookies. |
| No appointment slots | Check the booking horizon, working days, breaks/closures, active service, staff assignment, compatible counters, and occupied capacity. |
| Walk-in or call-next is unavailable | Check Asia/Karachi department hours, breaks, counter shift/status, staff assignment, and token eligibility. |
| Check-in is rejected | Wait for the configured arrival window; future appointments cannot be called before their start. |
| Cancellation/rescheduling is rejected | Check the department cutoff and whether the appointment has entered the queue. |
| Notifications or missed-appointment updates do not happen | Keep `npm.cmd run jobs` running and allow approximately a minute for scheduled processing. |
| No email or password-reset message | Configure SMTP, restart both processes, and use a real recipient address. |
| Browser tests cannot launch | Install Playwright Chromium or set the Chrome executable path shown above. |

When requesting help, provide the failing command and error message, with database URLs, passwords, session tokens, and job secrets removed.

## 14. Files and commands to remember

| File/folder | Purpose |
| --- | --- |
| `.env.local` | Private database and application settings |
| `.env.example` | Shareable configuration template |
| `package.json` / `package-lock.json` | Commands and reproducible dependency versions |
| `src/app` | Next.js pages and API routes |
| `src/components` | Customer, staff, and management screens |
| `src/lib` | Authentication, database, business rules, and jobs |
| `database` | Versioned SQL migrations |
| `scripts` | Migration, seeding, jobs, and verification tools |
| `tests` | Domain and browser workflow checks |
| `docs` | Setup, business rules, deployment, testing, and submission guides |

For normal use remember: **open the project folder → start `dev` → start `jobs` in a second terminal → open `http://localhost:3000` → sign in**.

## Completion checklist

- [ ] Node.js and npm version commands work.
- [ ] You are in the folder containing `package.json`.
- [ ] `.env.local` contains the correct private database URL and secrets.
- [ ] Dependencies install successfully.
- [ ] Database migrations complete and demo seed exists.
- [ ] Website and worker terminals are both running.
- [ ] Health reports `ok`.
- [ ] Customer, staff, manager, and administrator logins work.
- [ ] A token can move through waiting, called, serving, and completed.
- [ ] An appointment can be booked and checked in under the configured rules.
- [ ] No live credentials are present in files you share.

For the full module plan, read [README.md](../README.md). For the currently verified implementation and remaining submission work, read [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md).
