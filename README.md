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

The database lives at `data/fieldboard.db` (set `DB_PATH` to move it). Delete the file to start fresh; demo data is
seeded automatically when the database is empty.

## Project layout

```
shared/types.ts        Domain model shared by server and client (statuses, automations, etc.)
server/db.ts           SQLite schema
server/repo.ts         Row mappers + shared queries
server/api.ts          REST API (/api/...)
server/automations.ts  Automation rule engine
server/seed.ts         Demo data
server/api.test.ts     Tests
src/                   React + Tailwind web app (Vite)
  pages/               Dashboard, Jobs, JobDetail, Schedule, Clients, Board, MyWork, Automations, Settings
  components/          Layout, TaskDrawer, JobForm, shared UI
```

## Roadmap / not yet built

This is a working MVP. Before running the business on it, these are the next things to build, roughly in priority
order:

1. **Authentication and roles.** Right now the "Viewing as" menu in the top bar stands in for login. Techs should only
   see their own jobs, and the office should see everything.
2. **Quotes and invoices as documents**: PDF generation, emailing/texting clients, and online payment via Stripe.
3. **Client notifications**: "on my way" texts and appointment reminders (Twilio).
4. **Mobile tech view**: an installable PWA with job photos, before/after pictures, signatures and time tracking.
5. **Recurring jobs** for janitorial contracts and HVAC maintenance plans.
6. **More Monday column types**, such as custom columns per board, timeline/Gantt views and dependencies.
7. **Integrations**: QuickBooks sync, Xactimate import for restoration, and an importer for existing Jobber data.
8. Hosting on Postgres for multi-user production use.
