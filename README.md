# FieldBoard

**Field service management + Monday-style task boards for multi-division service companies.**

Jobber and Housecall Pro are great at the *field* side (clients, jobs, scheduling, line items) but weak at the
*work-management* side: follow-ups, insurance paperwork, hiring, marketing, the other 80% of running the business.
FieldBoard puts both in one app and connects them with automations. It is built for a company running
**Restoration, Junk Removal, Janitorial and HVAC** under one roof.

## What's in it

| Area | What it does |
| --- | --- |
| **Divisions** | Every job, board, tech and KPI belongs to a division. The top bar switches between *All divisions* and each division. Every division has its own color, job-number prefix (`RST-`, `JNK-`, `JAN-`, `HVC-`) and **custom job fields** (Restoration: claim #, carrier, adjuster, loss type · HVAC: equipment, model/serial, maintenance plan · Junk: load size · Janitorial: frequency, sq ft, contract end). Edit them in Settings. |
| **Dashboard** | Company-wide or per-division KPIs: open jobs, today's schedule, monthly revenue, unpaid invoices, open and overdue tasks. Also shows the pipeline, upcoming jobs and an activity feed. |
| **Jobs** | Drag-and-drop pipeline (Request → Quoted → Scheduled → In Progress → Completed → Invoiced → Paid) plus a list view. The job page covers the client, schedule, assigned tech, division fields, editable line items with totals, linked tasks and activity. |
| **Schedule** | Weekly dispatch board with one row per tech, color-coded by division, plus a "needs scheduling" tray. |
| **Clients** | One customer record shared by all divisions, with cross-division job history and lifetime revenue. |
| **Boards** (the Monday part) | Boards with colored, collapsible groups. Tasks have inline-editable status/priority cells, owners, due dates, subtasks, an updates thread and a link to a job. Table view with status "battery" summaries, a drag-and-drop Kanban view, search and person filters. |
| **My Work** | Everything assigned to you across every board, bucketed into Overdue / Today / This week / Later, plus today's jobs. |
| **Daily Logs** | A day page for every employee. It shows their **daily checklist** (auto-filled from templates by role, division or person, plus one-off items a manager assigns), an automatic **timeline** of the day (clock-ins, time on each job, checklist ticks, tasks finished, notes and photos), and an **end-of-day report** (what got done, issues, plan for tomorrow) that a manager signs off. The team view shows everyone's day at a glance: who's on the clock, hours, checklist progress and report status. |
| **Time tracking** | Clock in/out plus per-job timers. Starting a timer on a scheduled job moves it to In Progress. Weekly **Timesheets** show hours per person per day and the share spent on jobs, and every cell opens that day's log. Each job page shows labor hours by person. |
| **Job notes & photos** | Notes with any number of photos, taken from a phone camera or uploaded. Photos are resized on the device, so uploads work on a weak signal. They show on the job, in the tech app, and on the author's daily log. |
| **Invoicing** | Create an invoice from a job (its line items are copied), edit lines, tax, due date and message, mark it sent, record full or partial payments (card, check, cash, ACH, insurance), void it, and print or save a PDF. Each invoice has a **client link** (`/pay/…`) with a clean invoice page. Sending moves the job to Invoiced, and full payment moves it to Paid, which runs your automations. |
| **Tech app** (`/tech`) | A phone app for the crew that installs to the home screen. It has a big clock-in button with a live timer, today's visits with Call and Directions, a job screen (start/stop the job timer, complete the job, job tasks, notes and photos), and **My Day** (checklist, tasks due, end-of-day report). |
| **Automations** | "When X happens, do Y" rules that tie jobs to boards. For example: *when a Restoration job is created → create "Contact adjuster" task for the job's tech*, or *when an HVAC job is completed → create "Offer maintenance plan" follow-up*. Task titles support `{{job.number}}`, `{{job.title}}`, `{{client.name}}` and `{{task.title}}`. |

The app ships with realistic demo data for all four divisions so you can try everything right away.

## Running it

Requires **Node 22.13+**. It uses Node's built-in SQLite, so there is no database server to install.

```bash
npm install
npm run dev        # API on :3001 + web app on http://localhost:5173
```

Production:

```bash
npm run build
npm start          # serves API + built app on http://localhost:3001 (PORT to override)
```

Other scripts:

```bash
npm test           # API + automation tests
npm run typecheck
npm run seed       # wipe the database and reload demo data
```

The database lives at `data/fieldboard.db` (set `DB_PATH` to move it), and photos in `data/uploads` (`UPLOAD_DIR`). Delete the file to start fresh; demo data is
seeded automatically when the database is empty.

## Project layout

```
shared/types.ts        Domain model shared by server and client (statuses, automations, etc.)
server/db.ts           SQLite schema
server/repo.ts         Row mappers + shared queries
server/api.ts          REST API (/api/...)
server/automations.ts  Automation rule engine
server/time.ts         Clock in/out, timesheets, daily logs & checklists
server/notes.ts        Job notes + photo uploads (stored in data/uploads)
server/invoices.ts     Invoices, payments, client links, company settings
server/seed.ts         Demo data
server/*.test.ts       Tests
src/                   React + Tailwind web app (Vite)
  pages/               Office screens: Dashboard, Jobs, Daily Logs, Timesheets, Invoices, Boards, Settings…
  tech/                Phone app for field techs (/tech)
  components/          Layout, TaskDrawer, JobForm, shared UI
```

## Using the tech app on a phone

Open `http://<your-server>/tech` on the phone. Then use *Share → Add to Home Screen* (iPhone) or *Install app* (Android)
and it launches full-screen like a native app. Until logins exist, techs pick their name from the top of the screen.

## Roadmap / not yet built

This is a working MVP. Before running the business on it, these are the next things to build, roughly in priority
order:

1. **Authentication and roles.** Right now the name menus stand in for login. Techs should only see their own day, and
   only managers should sign off reports. Photo and invoice links are currently unauthenticated.
2. **Hosting.** Run it on a server with HTTPS (needed for phone installs and camera access), backups, and Postgres plus
   cloud photo storage once multiple offices use it.
3. **Sending invoices and taking payments.** Email/text the client link (SendGrid/Twilio) and pay by card/ACH via Stripe.
   Today you copy the link and record payments by hand.
4. **Offline mode for techs.** Queue clock-ins, notes and photos with no signal and sync later. The app shell loads
   offline today, but data doesn't.
5. **Payroll and job costing.** Overtime rules, timesheet approval, pay-rate × hours on each job for profit per job and
   per division, and a QuickBooks export.
6. **Quotes and client notifications**: quote approval by the client, "on my way" texts, and appointment reminders.
7. **Recurring jobs** for janitorial contracts and HVAC maintenance plans.
8. **GPS**: location stamp on clock-in/out and photos.
9. **Integrations**: QuickBooks sync, Xactimate import for restoration, and an importer for existing Jobber data.
