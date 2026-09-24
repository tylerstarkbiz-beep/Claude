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
| **Dashboard** | Company-wide or per-division numbers: open jobs, today's schedule, revenue this month (jobs *completed* this month), unpaid invoices, and open and overdue tasks. **Click any number** (the top tiles or a division card's rows) to see the jobs or tasks behind it; the revenue list includes each job's cost, profit and margin. Also shows who's on the clock, the pipeline, upcoming jobs and an activity feed. |
| **Team** | Add and edit members, including role, divisions, phone, and **loaded hourly cost** (wage plus payroll taxes, workers' comp, benefits). **Permissions** are pre-filled from the role and adjustable per person: see financials, invoice & collect, manage jobs, approve time & logs, manage team, company settings. Members who leave are marked inactive, so their history stays. |
| **Job costing** | Every job shows revenue (line items) against **labor**, which is tracked time × each person's hourly cost. The rate is saved on each time entry, so a raise doesn't rewrite past jobs. **Materials & other costs** are entered by category (materials, equipment rental, subcontractor, dump fees, permits, fuel). The result is profit and margin. **Profitability** reports by job and division for this month, last month, 90 days, the year or all time, optionally including jobs still in progress. |
| **Jobs** | Drag-and-drop pipeline (Request → Quoted → Scheduled → In Progress → Completed → Invoiced → Paid) plus a list view. The job page covers the client, schedule, assigned tech, division fields, editable line items with totals, linked tasks and activity. |
| **Schedule** | **Day, week and month** views. Day is a dispatch board with a column per tech plus Unassigned; week is seven days by hour; month is a calendar. **Drag a job** to change its day and time (15-minute steps, length kept). In day view, drag it into another tech's column to reassign it, and drag its bottom edge to change the end time. Drag jobs from the **Needs scheduling** tray onto the calendar to book them. Crew chips filter the calendar. Rescheduling needs the *Manage jobs* permission. |
| **Clients** | One customer record shared by all divisions, with cross-division job history and lifetime revenue. |
| **Boards** (the Monday part) | Boards with colored, collapsible groups. Tasks have inline-editable status/priority cells, owners, due dates, subtasks, an updates thread and a link to a job. Table view with status "battery" summaries, a drag-and-drop Kanban view, search and person filters. |
| **My Work** | Everything assigned to you across every board, bucketed into Overdue / Today / This week / Later, plus today's jobs. |
| **Daily Logs** | A day page for every employee. It shows their **daily checklist** (auto-filled from templates by role, division or person, plus one-off items a manager assigns), an automatic **timeline** of the day (clock-ins, time on each job, checklist ticks, tasks finished, notes and photos), and an **end-of-day report** (what got done, issues, plan for tomorrow) that a manager signs off. The team view shows everyone's day at a glance: who's on the clock, hours, checklist progress and report status. |
| **Time tracking** | Clock in/out plus per-job timers. Starting a timer on a scheduled job moves it to In Progress. Weekly **Timesheets** show hours per person per day and the share spent on jobs, and every cell opens that day's log. Each job page shows labor hours by person. |
| **Job notes & photos** | Notes with any number of photos, taken from a phone camera or uploaded. Photos are resized on the device, so uploads work on a weak signal. They show on the job, in the tech app, and on the author's daily log. |
| **Invoicing** | Create an invoice from a job (its line items are copied), edit lines, tax, due date and message, mark it sent, record full or partial payments (card, check, cash, ACH, insurance), void it, and print or save a PDF. Each invoice has a **client link** (`/pay/…`) with a clean invoice page. Sending moves the job to Invoiced, and full payment moves it to Paid, which runs your automations. |
| **Tech app** (`/tech`) | A phone app for the crew that installs to the home screen. It has a big clock-in button with a live timer, today's visits with Call and Directions, a job screen (start/stop the job timer, complete the job, job tasks, notes and photos), and **My Day** (checklist, tasks due, end-of-day report). |
| **Customer portal** (`/portal`) | Every new client gets a portal automatically. If they have an email, an invite with a single-use sign-in link goes out; there are no passwords. Clients see their requests (and submit new ones, which run your automations), **approve and sign estimates** with a drawn signature, **pay deposits**, and see upcoming and past visits and invoices. They can also save a card and pay online. On the client page the office can view the portal as the client, copy a sign-in link, re-send the invite or turn the portal off. |
| **Texting** | **Call** and **Text** buttons on every job (Call opens the phone's dialer). Ready-made texts for booking confirmations, request received, and estimate ready (with a link to approve), plus custom messages. **Automatic:** a **24-hour reminder** before each scheduled job, and a **daily follow-up** at 10am on estimates awaiting approval for up to N days, stopping when approved. Texts only go out 8am–8pm and respect a per-client opt-out. |
| **Deposits** | A default deposit % (Settings) with a per-estimate override. When a client signs, a deposit invoice is created for them to pay. A paid deposit is subtracted automatically on the final invoice. |
| **Automations** | "When X happens, do Y" rules that tie jobs to boards. For example: *when a Restoration job is created → create "Contact adjuster" task for the job's tech*, or *when an HVAC job is completed → create "Offer maintenance plan" follow-up*. Task titles support `{{job.number}}`, `{{job.title}}`, `{{client.name}}` and `{{task.title}}`. |

**Branding.** The app ships branded for Big Country Cleanup & Restoration: the logo is in the sidebar, the tech app,
invoices and the home-screen icon, and the colors come from it (navy `#184478`, red `#d93131`). Under
**Settings → Company & branding** you can upload a different logo and change the brand and accent colors. Every
screen picks them up, because the whole UI uses a `brand`/`accent` palette derived from those two colors.

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
npm run build:demo # one self-contained HTML file (app + sample data, runs in the browser) in dist-demo/
```

### Connecting outside services

These are all optional. Until each is connected, the app still works: messages wait in **Settings → Messages outbox**
with copyable links, and online card payment shows as "not available yet". Set these as environment variables on the server:

| Service | Variables | Used for |
| --- | --- | --- |
| Public address | `PUBLIC_URL` (e.g. `https://app.bigcountry.com`) | Links in emails and texts |
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Text messages. US business texting also needs A2P 10DLC registration in Twilio. |
| SendGrid | `SENDGRID_API_KEY`, `MAIL_FROM` | Portal invites and sign-in emails |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` | Saved cards, online invoice and deposit payments, "Charge card on file" |

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
server/team.ts         Team members, hourly rates, permissions
server/costing.ts      Job costing and the profitability report
server/portal.ts       Customer portal: sign-in links, sessions, client-scoped data, signatures
server/texting.ts      Text wording, office texts, and the reminder / follow-up scheduler
server/stripe.ts       Stripe (saved cards, payments); server/mailer.ts: email + text outbox
server/seed.ts         Demo data
server/*.test.ts       Tests
src/                   React + Tailwind web app (Vite)
  pages/               Office screens: Dashboard, Jobs, Daily Logs, Timesheets, Invoices, Boards, Settings…
  tech/                Phone app for field techs (/tech)
  portal/              Customer portal (/portal)
  components/          Layout, TaskDrawer, JobForm, shared UI
```

## Using the tech app on a phone

Open `http://<your-server>/tech` on the phone. Then use *Share → Add to Home Screen* (iPhone) or *Install app* (Android)
and it launches full-screen like a native app. Until logins exist, techs pick their name from the top of the screen.

## Roadmap / not yet built

This is a working MVP. Before running the business on it, these are the next things to build, roughly in priority
order:

1. **Authentication.** Right now the "Viewing as" menu stands in for login. Permissions are applied in the screens,
   but the server doesn't check who is asking until there are real logins. Photo and invoice links are also unauthenticated.
2. **Hosting.** Run it on a server with HTTPS (needed for phone installs and camera access), backups, and Postgres plus
   cloud photo storage once multiple offices use it.
3. **Connect Twilio, SendGrid and Stripe** (see above) and test each with real accounts. The payment code is tested
   against a simulated Stripe, not the real one. Add a Stripe webhook so payments settle even if the client closes the page.
4. **Offline mode for techs.** Queue clock-ins, notes and photos with no signal and sync later. The app shell loads
   offline today, but data doesn't.
5. **Payroll.** Overtime rules, timesheet approval, and a QuickBooks/payroll export. Also receipt photos on job costs.
6. **Quotes and client notifications**: quote approval by the client, "on my way" texts, and appointment reminders.
7. **Recurring jobs** for janitorial contracts and HVAC maintenance plans.
8. **GPS**: location stamp on clock-in/out and photos.
9. **Integrations**: QuickBooks sync, Xactimate import for restoration, and an importer for existing Jobber data.
