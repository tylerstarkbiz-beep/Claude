// Domain types shared by the API server and the web client.

export type FieldType = 'text' | 'number' | 'select' | 'date' | 'textarea';

/** A division-specific custom field shown on jobs for that division. */
export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
}

export interface Division {
  id: number;
  name: string;
  slug: string;
  /** Short code used in job numbers, e.g. RST-1001. */
  prefix: string;
  color: string;
  icon: string;
  fields: FieldDef[];
}

export type Role = 'owner' | 'manager' | 'technician' | 'office';

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  color: string;
  divisionIds: number[];
  /** Loaded cost per hour (wage + payroll taxes, workers' comp, etc.). Drives job labor cost. */
  hourlyRate: number;
  /** Default commission, as a % of the job total. Like hourlyRate, only sent to the member and to people who manage pay or the team. */
  commissionRate: number;
  permissions: Permission[];
  /** Inactive members keep their history but drop out of pickers and schedules. */
  active: boolean;
  /** Has a password set, so they can sign in. */
  hasLogin: boolean;
}

// ---------- Permissions ----------

export const PERMISSIONS = [
  'view_financials',
  'manage_invoices',
  'manage_jobs',
  'approve_time',
  'manage_team',
  'manage_settings',
  'manage_pay',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_META: Record<Permission, { label: string; description: string }> = {
  view_financials: { label: 'See financials', description: 'Prices, revenue, invoices, job costing and profitability' },
  manage_invoices: { label: 'Invoice & collect', description: 'Create and send invoices, record payments' },
  manage_jobs: { label: 'Manage jobs', description: 'Create, schedule, reassign and delete jobs and clients' },
  approve_time: { label: 'Approve time & logs', description: "Sign off daily reports and edit others' time" },
  manage_team: { label: 'Manage team', description: 'Add members, set hourly rates and permissions' },
  manage_settings: { label: 'Company settings', description: 'Divisions, checklists, automations and company info' },
  manage_pay: { label: 'Commissions & tips', description: "Log commissions, see everyone's earnings tracker and mark payouts" },
};

export const ROLE_DEFAULTS: Record<Role, Permission[]> = {
  owner: [...PERMISSIONS],
  manager: ['view_financials', 'manage_jobs', 'approve_time'],
  office: ['view_financials', 'manage_invoices', 'manage_jobs'],
  technician: [],
};

export const userCan = (user: User | undefined, perm: Permission) => !!user?.permissions.includes(perm);

export interface Client {
  id: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
}

// Requests and quotes are their own records now (see below); a job starts once a quote is accepted.
export const JOB_STATUSES = [
  'scheduled',
  'in_progress',
  'completed',
  'invoiced',
  'paid',
  'cancelled',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_META: Record<JobStatus, { label: string; color: string }> = {
  scheduled: { label: 'Scheduled', color: '#0ea5e9' },
  in_progress: { label: 'In Progress', color: '#f59e0b' },
  completed: { label: 'Completed', color: '#10b981' },
  invoiced: { label: 'Invoiced', color: '#6366f1' },
  paid: { label: 'Paid', color: '#16a34a' },
  cancelled: { label: 'Cancelled', color: '#94a3b8' },
};

export interface LineItem {
  id: number;
  jobId: number;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Job {
  id: number;
  number: string;
  divisionId: number;
  clientId: number;
  title: string;
  description: string | null;
  status: JobStatus;
  address: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  assigneeId: number | null;
  customFields: Record<string, string>;
  total: number;
  /** When the job first reached Completed; revenue is recognized in this month. */
  completedAt: string | null;
  /** 'portal' when it started from a client's portal request. */
  source: 'office' | 'portal';
  /** Deposit % carried from the quote; null means the company default. */
  depositPercent: number | null;
  reminderSentAt: string | null;
  /** The request and quote this job came from, if any. */
  requestId: number | null;
  quoteId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobDetail extends Job {
  client: Client;
  lineItems: LineItem[];
  tasks: Task[];
}

// Monday-style task statuses and priorities.
export const TASK_STATUSES = ['not_started', 'working', 'stuck', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  not_started: { label: 'Not Started', color: '#c4c4c4' },
  working: { label: 'Working on it', color: '#fdab3d' },
  stuck: { label: 'Stuck', color: '#e2445c' },
  done: { label: 'Done', color: '#00c875' },
};

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_META: Record<TaskPriority, { label: string; color: string }> = {
  low: { label: 'Low', color: '#579bfc' },
  medium: { label: 'Medium', color: '#5559df' },
  high: { label: 'High', color: '#401694' },
  critical: { label: 'Critical ⚠', color: '#333333' },
};

export interface Board {
  id: number;
  name: string;
  description: string | null;
  divisionId: number | null;
  createdAt: string;
}

export interface Group {
  id: number;
  boardId: number;
  name: string;
  color: string;
  position: number;
}

export interface Task {
  id: number;
  boardId: number;
  groupId: number;
  parentId: number | null;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: number | null;
  dueDate: string | null;
  jobId: number | null;
  position: number;
  createdAt: string;
  completedAt: string | null;
  subtaskCount?: number;
  subtaskDoneCount?: number;
  updateCount?: number;
}

export interface BoardDetail extends Board {
  groups: Group[];
  tasks: Task[];
}

export interface TaskUpdate {
  id: number;
  taskId: number;
  authorId: number | null;
  body: string;
  createdAt: string;
}

export interface TaskDetail extends Task {
  subtasks: Task[];
  updates: TaskUpdate[];
}

// Automations: "When <trigger>, do <action>".
export type AutomationTrigger =
  | { type: 'job_created'; divisionId?: number | null }
  | { type: 'job_status_changed'; toStatus: JobStatus; divisionId?: number | null }
  | { type: 'task_status_changed'; toStatus: TaskStatus; boardId?: number | null };

export type AutomationAction =
  | {
      type: 'create_task';
      boardId: number;
      groupId?: number | null;
      /** Supports {{job.number}}, {{job.title}}, {{client.name}}, {{task.title}} placeholders. */
      title: string;
      /** A user id, or 'job_assignee' to copy the job's assigned tech. */
      assignee?: number | 'job_assignee' | null;
      priority?: TaskPriority;
      dueInDays?: number | null;
    }
  | { type: 'set_job_status'; status: JobStatus };

export interface Automation {
  id: number;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  action: AutomationAction;
  runCount: number;
  createdAt: string;
}

export interface ActivityEntry {
  id: number;
  kind: string;
  message: string;
  jobId: number | null;
  taskId: number | null;
  createdAt: string;
}

export interface DashboardTiles {
  openJobs: number;
  scheduledToday: number;
  revenueMonth: number;
  outstanding: number;
  openTasks: number;
  overdueTasks: number;
}

export interface DashboardStats {
  /** Tile numbers for the current filter (includes boards not tied to a division). */
  totals: DashboardTiles;
  divisions: {
    divisionId: number;
    openJobs: number;
    scheduledToday: number;
    revenueMonth: number;
    outstanding: number;
    openTasks: number;
    overdueTasks: number;
  }[];
  jobsByStatus: Record<JobStatus, number>;
  upcomingJobs: Job[];
  overdueTasks: Task[];
  recentActivity: ActivityEntry[];
  onTheClock: { userId: number; jobId: number | null; category: string | null; startedAt: string }[];
}

// ---------- Time tracking ----------

/**
 * One continuous block of work. A user is "clocked in" while they have an entry with no endedAt.
 * jobId = null means general time (shop, travel, admin); otherwise time on that job.
 * Timestamps are local wall-clock ISO strings (YYYY-MM-DDTHH:MM:SS).
 */
export interface TimeEntry {
  id: number;
  userId: number;
  jobId: number | null;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
  /** For general (non-job) time: what kind, e.g. "Shop work". Null on job time. */
  category: string | null;
  job?: { number: string; title: string; divisionId: number } | null;
}

/** Kinds of general time a tech can clock in to when they're not on a job. Not job-costed. */
export const GENERAL_TIME_CATEGORIES = ['General', 'Shop work', 'Travel', 'Office / admin', 'Training', 'Equipment upkeep'] as const;

/** What a tech can clock in to right now. */
export interface ClockOptions {
  /** Their own jobs scheduled today. */
  myJobs: Job[];
  /** Other jobs underway or scheduled today (helping another crew). */
  otherJobs: Job[];
  categories: string[];
}

// ---------- Job notes & photos ----------

export interface Photo {
  id: number;
  jobId: number | null;
  noteId: number | null;
  authorId: number | null;
  url: string;
  caption: string | null;
  createdAt: string;
}

/** Which step of the chain a note belongs to. */
export type Stage = 'request' | 'quote' | 'job';

export interface JobNote {
  id: number;
  /** Exactly one of these is set: the step the note was added on. */
  jobId: number | null;
  requestId: number | null;
  quoteId: number | null;
  stage: Stage;
  /** e.g. REQ-1004, Q-1007 or RST-1012 */
  stageNumber: string;
  authorId: number | null;
  /** Shown to the client in their portal. Notes the client wrote are always visible to them. */
  clientVisible: boolean;
  /** Written by the client in the portal. */
  fromClient: boolean;
  body: string;
  createdAt: string;
  photos: Photo[];
}

// ---------- Requests & quotes ----------

export const REQUEST_STATUSES = ['new', 'assessment_scheduled', 'converted', 'archived'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const REQUEST_STATUS_META: Record<RequestStatus, { label: string; color: string }> = {
  new: { label: 'New', color: '#0ea5e9' },
  assessment_scheduled: { label: 'Assessment scheduled', color: '#f59e0b' },
  converted: { label: 'Converted to quote', color: '#16a34a' },
  archived: { label: 'Archived', color: '#94a3b8' },
};

/** A client asking for a visit to inspect and quote. Stays on the account after it becomes a quote. */
export interface ServiceRequest {
  id: number;
  number: string;
  clientId: number;
  divisionId: number;
  title: string;
  details: string;
  address: string | null;
  preferredTimes: string | null;
  source: 'office' | 'portal';
  status: RequestStatus;
  /** The visit to inspect and quote. */
  assessmentStart: string | null;
  assessmentEnd: string | null;
  assessmentAssigneeId: number | null;
  createdBy: number | null;
  createdAt: string;
}

export const QUOTE_STATUSES = ['draft', 'sent', 'changes_requested', 'approved', 'declined', 'converted'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export const QUOTE_STATUS_META: Record<QuoteStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: '#64748b' },
  sent: { label: 'Awaiting approval', color: '#8b5cf6' },
  changes_requested: { label: 'Changes requested', color: '#f59e0b' },
  approved: { label: 'Approved', color: '#0ea5e9' },
  declined: { label: 'Declined', color: '#94a3b8' },
  converted: { label: 'Converted to job', color: '#16a34a' },
};

export interface QuoteItem {
  id: number;
  quoteId: number;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Quote {
  id: number;
  number: string;
  clientId: number;
  divisionId: number;
  requestId: number | null;
  title: string;
  description: string;
  address: string | null;
  status: QuoteStatus;
  total: number;
  /** null = company default */
  depositPercent: number | null;
  sentAt: string | null;
  approvedAt: string | null;
  /** 'client' when signed in the portal, otherwise the staff member's name who recorded a verbal/paper approval. */
  approvedBy: string | null;
  signerName: string | null;
  followupCount: number;
  createdAt: string;
}

export interface QuoteDetail extends Quote {
  items: QuoteItem[];
  client: Client;
  /** PNG data URL of the client's signature, if signed in the portal. */
  signature: string | null;
}

/** One record's place in the request → quote → job → invoice chain. */
export interface Chain {
  request: { id: number; number: string; status: RequestStatus; createdAt: string } | null;
  quote: { id: number; number: string; status: QuoteStatus; total: number; approvedAt: string | null } | null;
  job: { id: number; number: string; status: JobStatus; completedAt: string | null } | null;
  invoices: { id: number; number: string; status: InvoiceStatus; kind: 'standard' | 'deposit'; total: number }[];
}

// ---------- Invoicing ----------

export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_META: Record<InvoiceStatus | 'overdue', { label: string; color: string }> = {
  draft: { label: 'Draft', color: '#94a3b8' },
  sent: { label: 'Awaiting payment', color: '#0ea5e9' },
  overdue: { label: 'Overdue', color: '#e2445c' },
  paid: { label: 'Paid', color: '#16a34a' },
  void: { label: 'Void', color: '#64748b' },
};

export const PAYMENT_METHODS = ['Card', 'Check', 'Cash', 'ACH', 'Insurance', 'Other'] as const;

export interface InvoiceItem {
  id: number;
  invoiceId: number;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Payment {
  id: number;
  invoiceId: number;
  amount: number;
  method: string;
  paidOn: string;
  note: string | null;
}

export interface Invoice {
  id: number;
  number: string;
  /** 'deposit' invoices are paid when an estimate is approved and credited on the final invoice. */
  kind: 'standard' | 'deposit';
  jobId: number | null;
  /** Deposits are raised against the quote when it's approved, before the job exists. */
  quoteId: number | null;
  clientId: number;
  divisionId: number | null;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  taxRate: number;
  notes: string | null;
  publicToken: string;
  subtotal: number;
  tax: number;
  total: number;
  amountPaid: number;
  balance: number;
  overdue: boolean;
  createdAt: string;
}

export interface InvoiceDetail extends Invoice {
  items: InvoiceItem[];
  payments: Payment[];
  client: Client;
  job: Job | null;
}

// ---------- Daily logs ----------

/** A recurring daily checklist item that auto-appears for matching employees. */
export interface ChecklistTemplate {
  id: number;
  title: string;
  /** Limit to one person, one role, and/or one division. All null = everyone. */
  userId: number | null;
  role: User['role'] | null;
  divisionId: number | null;
  active: boolean;
}

export interface DailyItem {
  id: number;
  userId: number;
  date: string;
  title: string;
  doneAt: string | null;
  templateId: number | null;
  createdBy: number | null;
}

export interface DailyReport {
  summary: string;
  issues: string;
  tomorrow: string;
  submittedAt: string | null;
  reviewedBy: number | null;
  reviewedAt: string | null;
}

/** Everything one employee did (and was supposed to do) on one day. */
export interface DailyLog {
  userId: number;
  date: string;
  items: DailyItem[];
  report: DailyReport;
  timeEntries: TimeEntry[];
  totalMinutes: number;
  jobMinutes: number;
  jobs: Job[];
  tasksCompleted: Task[];
  tasksOpen: Task[];
  notes: (JobNote & { job: { id: number; number: string; title: string } | null })[];
}

/** One row in the team's daily overview. */
export interface DailySummary {
  userId: number;
  totalMinutes: number;
  clockedIn: boolean;
  currentJobId: number | null;
  itemsDone: number;
  itemsTotal: number;
  tasksCompleted: number;
  jobs: number;
  notes: number;
  submitted: boolean;
  reviewed: boolean;
}

/** Business details printed on invoices. */
export interface CompanySettings {
  name: string;
  phone: string;
  email: string;
  address: string;
  /** Default days until an invoice is due. */
  paymentTermsDays: number;
  /** Default sales tax % for new invoices. */
  defaultTaxRate: number;
  invoiceFooter: string;
  /** Logo as a data URL (PNG/JPEG/WebP), shown in the app and on invoices; null for none. */
  logo: string | null;
  /** Automatic text: a reminder 24 hours before each scheduled job. */
  textReminders: boolean;
  /** Automatic text: a daily nudge on estimates waiting for approval, for up to quoteFollowUpDays days. */
  quoteFollowUps: boolean;
  quoteFollowUpDays: number;
  /** Deposit collected when a client approves an estimate (% of the total; 0 = none). Jobs can override. */
  depositPercent: number;
  /** Main brand color (buttons, links, highlights) and accent color, as #rrggbb. */
  brandColor: string;
  accentColor: string;
}

// ---------- Job costing ----------

export const COST_CATEGORIES = ['Materials', 'Equipment rental', 'Subcontractor', 'Dump / disposal fees', 'Permits', 'Fuel / travel', 'Other'] as const;

export interface JobCost {
  id: number;
  jobId: number;
  category: string;
  description: string;
  amount: number;
  date: string;
  createdBy: number | null;
}

export interface JobCosting {
  revenue: number;
  invoiced: number;
  laborMinutes: number;
  laborCost: number;
  labor: { userId: number; minutes: number; cost: number; rate: number }[];
  costs: JobCost[];
  otherCosts: number;
  /** Commissions logged on this job (tips aren't a company cost). */
  commissions: number;
  totalCost: number;
  profit: number;
  /** Profit as a % of revenue; null when there is no revenue yet. */
  margin: number | null;
}

/** One job's row in the profitability report. */
export interface ProfitRow {
  jobId: number;
  number: string;
  title: string;
  clientId: number;
  divisionId: number;
  status: JobStatus;
  completedAt: string | null;
  revenue: number;
  laborMinutes: number;
  laborCost: number;
  otherCosts: number;
  commissions: number;
  profit: number;
  margin: number | null;
}

export type DashboardListKind = 'open_jobs' | 'today' | 'revenue' | 'open_tasks';

// ---------- Commissions & tips ----------

export type EarningKind = 'commission' | 'tip';

export interface Earning {
  id: number;
  userId: number;
  jobId: number | null;
  jobNumber: string | null;
  jobTitle: string | null;
  kind: EarningKind;
  amount: number;
  note: string;
  /** YYYY-MM-DD; the month it counts toward. */
  earnedOn: string;
  createdBy: number | null;
  createdAt: string;
  /** When it was paid out on a paycheck; null while still owed. */
  paidOutAt: string | null;
}

export interface EarningTotals {
  commission: number;
  tip: number;
  total: number;
}

/** One person's tracker for a month. */
export interface EarningsSummary {
  userId: number;
  month: string; // YYYY-MM
  totals: EarningTotals;
  lastMonth: EarningTotals;
  /** Everything logged and not yet paid out, any month. */
  unpaid: number;
  /** The six months ending with `month`, oldest first. */
  history: ({ month: string } & EarningTotals)[];
  entries: Earning[];
}

export interface TeamEarningsRow extends EarningTotals {
  userId: number;
  unpaid: number;
}
