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

export interface User {
  id: number;
  name: string;
  email: string;
  role: 'owner' | 'manager' | 'technician' | 'office';
  color: string;
  divisionIds: number[];
}

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

export const JOB_STATUSES = [
  'request',
  'quoted',
  'scheduled',
  'in_progress',
  'completed',
  'invoiced',
  'paid',
  'cancelled',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_META: Record<JobStatus, { label: string; color: string }> = {
  request: { label: 'Request', color: '#64748b' },
  quoted: { label: 'Quoted', color: '#8b5cf6' },
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

export interface DashboardStats {
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
}
