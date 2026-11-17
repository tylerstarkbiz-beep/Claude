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
| **Team** | Add and edit members, including role, divisions, phone, and **loaded hourly cost** (wage plus payroll taxes, workers' comp, benefits). **Permissions** are pre-filled from the role and adjustable per person: see financials, invoice & collect, manage jobs, approve time & logs, manage team, company settings, commissions & tips. Members who leave are marked inactive, so their history stays. |
| **Job costing** | Every job shows revenue (line items) against **labor**, which is tracked time × each person's hourly cost. The rate is saved on each time entry, so a raise doesn't rewrite past jobs. **Materials & other costs** are entered by category (materials, equipment rental, subcontractor, dump fees, permits, fuel). The result is profit and margin. **Profitability** reports by job and division for this month, last month, 90 days, the year or all time, optionally including jobs still in progress. |
| **Commissions & tips** | Every tech has a private **earnings tracker** (office: *Commissions & Tips*; tech app: *My Pay*). It shows what they've earned this month on top of hourly pay, split into commissions and tips, plus what's still owed and a six-month trend. Commissions and tips are added from a job (commissions pre-fill from the tech's **commission %**, set on the Team page), **only by people with the *Commissions & tips* permission**, once the money is verified as paid out from the job. Techs can't add, edit or remove anything on their own tracker; it's read-only for them. **Each person sees only their own tracker.** Owners and admins see the whole team and can mark earnings paid out after payroll. The server checks every earnings request against the signed-in person, and other people's pay rates aren't sent to techs' screens. Commissions count as a job cost in job costing and profitability. Tips don't, since the customer pays them. |
| **Requests → quotes → jobs → invoices** | The work flows through four linked records, and **each step stays on the client's account** after it moves on. **Requests** (office *Requests* page, or the client in their portal, with photos) are asks for a visit to inspect and quote: book the **assessment visit** with a tech, add notes and photos, then **Convert to quote**. **Quotes** get line items, a scope of work and a deposit %; *Send* makes them visible in the client's portal to **approve and sign**, or ask for changes. You can also *Record approval* given by phone or on paper. **Convert to job** copies the line items, scope, address and deposit onto a new job, and the job's invoice is created as before. A **chain bar** at the top of every request, quote, job and invoice shows the whole path (REQ → Q → job → deposit/invoice) with links. **Notes and photos carry through**: the job and invoice show everything recorded on the request and quote, labeled by step. The client page's **Work history** lists every piece of work as its chain. |
| **Jobs** | Drag-and-drop pipeline (Scheduled → In Progress → Completed → Invoiced → Paid) plus a list view. Jobs usually start from an approved quote; you can still create one directly. The job page covers the client, schedule, assigned tech, division fields, editable line items with totals, linked tasks, the chain back to its request and quote, and activity. |
| **Schedule** | **Day, week and month** views. Day is a dispatch board with a column per tech plus Unassigned; week is seven days by hour; month is a calendar. **Drag a job** to change its day and time (15-minute steps, length kept). In day view, drag it into another tech's column to reassign it, and drag its bottom edge to change the end time. Drag jobs from the **Needs scheduling** tray onto the calendar to book them. Crew chips filter the calendar. Rescheduling needs the *Manage jobs* permission. |
| **Clients** | One customer record shared by all divisions, with **work history** (every request, quote, job and invoice, grouped into chains), lifetime revenue, and New request / New job buttons. |
| **Boards** (the Monday part) | Boards with colored, collapsible groups. Tasks have inline-editable status/priority cells, owners, due dates, subtasks, an updates thread and a link to a job. Table view with status "battery" summaries, a drag-and-drop Kanban view, search and person filters. |
| **My Work** | Everything assigned to you across every board, bucketed into Overdue / Today / This week / Later, plus today's jobs. |
| **Daily Logs** | A day page for every employee. It shows their **daily checklist** (auto-filled from templates by role, division or person, plus one-off items a manager assigns), an automatic **timeline** of the day (clock-ins, time on each job, checklist ticks, tasks finished, notes and photos), and an **end-of-day report** (what got done, issues, plan for tomorrow) that a manager signs off. The team view shows everyone's day at a glance: who's on the clock, hours, checklist progress and report status. |
| **Time tracking** | Techs tap **Clock in** and pick what they're working on: **one of their jobs** (or another crew's job they're helping on), or **general time** (plain general time, or shop work, travel, office/admin, training, equipment upkeep). **Switch** moves them between jobs and general time without clocking out, and each job screen has *Clock in to this job* / *Leave this job* (back to general time). Time clocked to a job is that job's **labor cost** (hours × the tech's rate) in job costing and profitability; general time isn't charged to any job. Techs can clock only themselves in and out, and only managers who approve time can add or edit entries by hand. Clocking in to a scheduled job moves it to In Progress. Weekly **Timesheets** show hours per person per day and the share spent on jobs, and every cell opens that day's log. |
| **Notes & photos** | Notes with any number of photos on a request, quote or job, taken from a phone camera or uploaded. Photos are resized on the device, so uploads work on a weak signal. Each note is **Internal** or **Shared with customer** (click to switch). Shared notes, and anything the client wrote or uploaded, appear in their portal. They show on the record, on every later step of its chain, in the tech app, and on the author's daily log. |
| **Invoicing** | Create an invoice from a job (its line items are copied), edit lines, tax, due date and message, mark it sent, record full or partial payments (card, check, cash, ACH, insurance), void it, and print or save a PDF. Each invoice has a **client link** (`/pay/…`) with a clean invoice page. Sending moves the job to Invoiced, and full payment moves it to Paid, which runs your automations. |
| **Tech app** (`/tech`) | A phone app for the crew that installs to the home screen. It has a big clock-in button with a live timer, today's visits with Call and Directions, a job screen (start/stop the job timer, complete the job, job tasks, notes and photos), and **My Day** (checklist, tasks due, end-of-day report). |
| **Customer portal** (`/portal`) | Every new client gets a portal automatically. If they have an email, an invite with a single-use sign-in link goes out; there are no passwords. Clients **send requests with photos**, see when the assessment visit is booked, **approve and sign quotes** with a drawn signature (or ask for changes), **pay deposits**, and see upcoming and past visits and invoices. Each request, quote, visit and invoice has a **history** view: the chain from request to invoice plus the notes and photos shared with them. They can also save a card and pay online. On the client page the office can view the portal as the client, copy a sign-in link, re-send the invite or turn the portal off. |
| **Texting** | **Call** and **Text** buttons on every request, quote and job (Call opens the phone's dialer). Ready-made texts: request received and assessment-visit confirmation (requests), quote ready with an approval link and quote follow-up (quotes), booking confirmation (jobs), plus custom messages. **Automatic:** a **24-hour reminder** before each scheduled job, and a **daily follow-up** at 10am on sent quotes awaiting approval for up to N days, stopping when approved. Texts only go out 8am–8pm and respect a per-client opt-out. |
| **Deposits** | A default deposit % (Settings) with a per-quote override. When a quote is approved (signed in the portal or recorded by the office), a deposit invoice is created for the client to pay. It moves onto the job when the quote is converted, and a paid deposit is subtracted automatically on the final invoice. |
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

### Signing in

Staff sign in with their email and password. Sessions last 30 days, and **Sign out** is in the top bar. After 8 wrong
passwords, an email is locked for 15 minutes. Passwords are stored only as salted PBKDF2 hashes.

The demo data includes these accounts, all with the password **`BigCountry2026`**:

| Account | Email | Access |
| --- | --- | --- |
| Office Admin | `admin@example.com` | Full access (owner) |
| Alex Morgan | `alex@example.com` | Full access (owner) |
| Tony Ruiz | `tony@example.com` | Technician |
| Jordan Lee | `jordan@example.com` | Office staff |

Every other demo team member uses the same password. **Before real use**, give each person their own password on the
**Team** page; the Password field there sets or resets it and signs them out everywhere. Members with no password show
a *No login* tag. Deactivating someone signs them out immediately.

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
server/auth.ts         Staff sign-in: password hashing, sessions, the sign-in check on every office request
server/earnings.ts     Commissions & tips: private per-person trackers, logging rules, payouts
server/pipeline.ts     Requests, quotes, conversions (request → quote → job) and the chain linking every step
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

1. **Finish access control.** Staff sign-in is in place, and every office request requires it. The server enforces
   commissions & tips and team management (adding members, rates, passwords). Other permissions (financials, invoicing,
   job edits, settings) are still applied only in the screens, so the next step is checking each of them on the server too.
   Also: password reset by email, and protecting job photo links (currently anyone with the link can open a photo).
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
