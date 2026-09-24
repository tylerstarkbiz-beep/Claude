// Automation engine: "When <trigger> happens, do <action>".
// Rules are evaluated synchronously after the change that fired them.
import { logActivity, type DB } from './db.ts';
import { createTask, getClient, getJob, localDate, localDateTime, mapAutomation } from './repo.ts';
import { JOB_STATUS_META, type Automation, type Job, type JobStatus, type Task, type TaskStatus } from '../shared/types.ts';

export type AutomationEvent =
  | { type: 'job_created'; job: Job }
  | { type: 'job_status_changed'; job: Job; from: JobStatus; to: JobStatus }
  | { type: 'task_status_changed'; task: Task; from: TaskStatus; to: TaskStatus };

// set_job_status can fire job_status_changed, which can create tasks, and so on.
// Cap the chain so a misconfigured pair of rules can't loop forever.
const MAX_DEPTH = 3;

function matches(rule: Automation, event: AutomationEvent): boolean {
  const t = rule.trigger;
  if (t.type !== event.type) return false;
  switch (event.type) {
    case 'job_created': {
      const trig = t as Extract<Automation['trigger'], { type: 'job_created' }>;
      return !trig.divisionId || trig.divisionId === event.job.divisionId;
    }
    case 'job_status_changed': {
      const trig = t as Extract<Automation['trigger'], { type: 'job_status_changed' }>;
      return trig.toStatus === event.to && (!trig.divisionId || trig.divisionId === event.job.divisionId);
    }
    case 'task_status_changed': {
      const trig = t as Extract<Automation['trigger'], { type: 'task_status_changed' }>;
      return trig.toStatus === event.to && (!trig.boardId || trig.boardId === event.task.boardId);
    }
  }
}

function render(template: string, ctx: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => ctx[key] ?? '');
}

/** Runs matching rules and returns a human-readable line for each action taken. */
export function runAutomations(db: DB, event: AutomationEvent, depth = 0): string[] {
  const ran: string[] = [];
  if (depth >= MAX_DEPTH) return ran;
  const rules = db
    .prepare('SELECT * FROM automations WHERE enabled = 1 ORDER BY id')
    .all()
    .map(mapAutomation)
    .filter((rule) => matches(rule, event));

  for (const rule of rules) {
    const job = event.type === 'task_status_changed' ? (event.task.jobId ? getJob(db, event.task.jobId) : undefined) : event.job;
    const client = job ? getClient(db, job.clientId) : undefined;
    const ctx: Record<string, string> = {
      'job.number': job?.number ?? '',
      'job.title': job?.title ?? '',
      'client.name': client?.name ?? '',
      'task.title': event.type === 'task_status_changed' ? event.task.title : '',
    };

    const action = rule.action;
    const before = ran.length;
    try {
    if (action.type === 'create_task') {
      const assigneeId = action.assignee === 'job_assignee' ? (job?.assigneeId ?? null) : (action.assignee ?? null);
      const task = createTask(db, {
        boardId: action.boardId,
        groupId: action.groupId ?? null,
        title: render(action.title, ctx) || rule.name,
        priority: action.priority ?? 'medium',
        assigneeId,
        dueDate: action.dueInDays != null ? localDate(action.dueInDays) : null,
        jobId: job?.id ?? null,
      });
      const msg = `⚡ ${rule.name}: created task "${task.title}"`;
      logActivity(db, 'automation', msg, { jobId: job?.id, taskId: task.id });
      ran.push(msg);
    } else if (action.type === 'set_job_status' && job && job.status !== action.status) {
      db.prepare("UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ?").run(action.status, job.id);
      syncCompletedAt(db, job.id, action.status);
      const msg = `⚡ ${rule.name}: moved ${job.number} to ${action.status}`;
      logActivity(db, 'automation', msg, { jobId: job.id });
      ran.push(msg);
      ran.push(...runAutomations(db, { type: 'job_status_changed', job: getJob(db, job.id)!, from: job.status, to: action.status }, depth + 1));
    }
    } catch (err) {
      // A broken rule (e.g. its board was deleted) must not block the change that fired it.
      logActivity(db, 'automation_error', `⚠ ${rule.name} failed: ${err instanceof Error ? err.message : String(err)}`, {
        jobId: job?.id,
      });
    }
    if (ran.length > before) db.prepare('UPDATE automations SET run_count = run_count + 1 WHERE id = ?').run(rule.id);
  }
  return ran;
}

const DONE: JobStatus[] = ['completed', 'invoiced', 'paid'];

/** Stamp when a job first reaches Completed (kept through Invoiced/Paid); clear it if the job is reopened. */
export function syncCompletedAt(db: DB, jobId: number, status: JobStatus) {
  if (DONE.includes(status)) db.prepare('UPDATE jobs SET completed_at = COALESCE(completed_at, ?) WHERE id = ?').run(localDateTime(), jobId);
  else db.prepare('UPDATE jobs SET completed_at = NULL WHERE id = ?').run(jobId);
}

/** Log a job's status change and run matching automations. Call after the row is updated. */
export function onJobStatusChanged(db: DB, before: Job, after: Job): string[] {
  syncCompletedAt(db, after.id, after.status);
  // A fresh estimate starts a fresh round of daily follow-ups.
  if (after.status === 'quoted') db.prepare('UPDATE jobs SET quoted_at = ?, followup_count = 0, last_followup_on = NULL WHERE id = ?').run(localDateTime(), after.id);
  after = getJob(db, after.id)!;
  logActivity(db, 'job', `${after.number} moved from ${JOB_STATUS_META[before.status].label} to ${JOB_STATUS_META[after.status].label}`, {
    jobId: after.id,
  });
  return runAutomations(db, { type: 'job_status_changed', job: after, from: before.status, to: after.status });
}

/** Move a job to a new status (no-op if already there), with logging and automations. */
export function setJobStatus(db: DB, jobId: number, status: JobStatus): string[] {
  const before = getJob(db, jobId);
  if (!before || before.status === status) return [];
  db.prepare("UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, jobId);
  return onJobStatusChanged(db, before, getJob(db, jobId)!);
}
