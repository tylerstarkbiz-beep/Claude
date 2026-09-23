import { useState } from 'react';
import clsx from 'clsx';
import { Plus, Trash2, Zap } from 'lucide-react';
import { del, patch, post, useApi } from '../api';
import { useApp } from '../store';
import { Button, EmptyState, Modal, PageHeader } from '../components/ui';
import {
  JOB_STATUSES,
  JOB_STATUS_META,
  TASK_PRIORITIES,
  TASK_PRIORITY_META,
  TASK_STATUSES,
  TASK_STATUS_META,
  type Automation,
  type AutomationAction,
  type AutomationTrigger,
  type BoardDetail,
} from '../../shared/types';

export function Automations() {
  const app = useApp();
  const { data: rules, reload } = useApi<Automation[]>('/automations');
  const [editing, setEditing] = useState<Automation | 'new' | null>(null);

  const describeTrigger = (t: AutomationTrigger) => {
    if (t.type === 'task_status_changed') {
      const board = app.boards.find((b) => b.id === t.boardId);
      return (
        <>
          When a task{board ? <> on <b>{board.name}</b></> : ''} changes to <b>{TASK_STATUS_META[t.toStatus].label}</b>
        </>
      );
    }
    const div = app.division(t.divisionId);
    const scope = div ? <b style={{ color: div.color }}>{div.name} </b> : 'any ';
    if (t.type === 'job_created') return <>When a new {scope}job is created</>;
    return (
      <>
        When {div ? 'a ' : ''}
        {scope}job moves to <b>{JOB_STATUS_META[t.toStatus].label}</b>
      </>
    );
  };

  const describeAction = (a: AutomationAction) => {
    if (a.type === 'set_job_status') return <>set the linked job to <b>{JOB_STATUS_META[a.status].label}</b></>;
    const board = app.boards.find((b) => b.id === a.boardId);
    const who = a.assignee === 'job_assignee' ? 'the job’s tech' : app.user(typeof a.assignee === 'number' ? a.assignee : null)?.name;
    return (
      <>
        create task <b>“{a.title}”</b> on <b>{board?.name ?? 'a deleted board'}</b>
        {who && <> for {who}</>}
        {a.dueInDays != null && <>, due in {a.dueInDays} day{a.dueInDays === 1 ? '' : 's'}</>}
      </>
    );
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Automations"
        subtitle="Connect field work to task boards: when a job or task changes, the follow-up work creates itself."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus size={16} /> New automation
          </Button>
        }
      />
      {!rules?.length ? (
        <EmptyState>No automations yet.</EmptyState>
      ) : (
        <div className="space-y-3">
          {rules.map((r) => (
            <div key={r.id} className={clsx('card flex items-start gap-4 p-4', !r.enabled && 'opacity-60')}>
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-100 text-indigo-600">
                <Zap size={18} />
              </div>
              <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(r)}>
                <div className="font-medium">{r.name}</div>
                <div className="mt-1 text-sm text-slate-600">
                  {describeTrigger(r.trigger)}, {describeAction(r.action)}.
                </div>
                <div className="mt-1 text-xs text-slate-400">Ran {r.runCount} times</div>
              </button>
              <label className="flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={r.enabled}
                  onChange={async () => (await patch(`/automations/${r.id}`, { enabled: !r.enabled }), reload())}
                />
                <span className="relative h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-emerald-500 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4" />
              </label>
              <button
                className="text-slate-400 hover:text-rose-600"
                onClick={async () => {
                  if (confirm(`Delete "${r.name}"?`)) {
                    await del(`/automations/${r.id}`);
                    reload();
                  }
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <AutomationForm
          rule={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function AutomationForm({ rule, onClose, onSaved }: { rule: Automation | null; onClose: () => void; onSaved: () => void }) {
  const app = useApp();
  const [name, setName] = useState(rule?.name ?? '');
  const [trigger, setTrigger] = useState<AutomationTrigger>(rule?.trigger ?? { type: 'job_status_changed', toStatus: 'completed', divisionId: null });
  const [action, setAction] = useState<AutomationAction>(
    rule?.action ?? { type: 'create_task', boardId: app.boards[0]?.id, groupId: null, title: 'Follow up with {{client.name}}', assignee: null, priority: 'medium', dueInDays: 1 },
  );
  const { data: board } = useApi<BoardDetail>(action.type === 'create_task' && action.boardId ? `/boards/${action.boardId}` : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = { name, trigger, action };
    try {
      if (rule) await patch(`/automations/${rule.id}`, body);
      else await post('/automations', body);
      onSaved();
    } catch (err) {
      app.toast((err as Error).message, 'error');
    }
  }

  const ct = action.type === 'create_task' ? action : null;
  const setCt = (changes: Partial<Extract<AutomationAction, { type: 'create_task' }>>) => ct && setAction({ ...ct, ...changes });

  return (
    <Modal title={rule ? 'Edit automation' : 'New automation'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <span className="label">Name</span>
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Completed job → request review" />
        </div>

        <fieldset className="rounded-lg border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold">When…</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <select
              className="input"
              value={trigger.type}
              onChange={(e) => {
                const type = e.target.value as AutomationTrigger['type'];
                setTrigger(
                  type === 'job_created'
                    ? { type, divisionId: null }
                    : type === 'job_status_changed'
                      ? { type, toStatus: 'completed', divisionId: null }
                      : { type, toStatus: 'done', boardId: null },
                );
              }}
            >
              <option value="job_created">a job is created</option>
              <option value="job_status_changed">a job's status changes to</option>
              <option value="task_status_changed">a task's status changes to</option>
            </select>
            {trigger.type === 'job_status_changed' && (
              <select className="input" value={trigger.toStatus} onChange={(e) => setTrigger({ ...trigger, toStatus: e.target.value as never })}>
                {JOB_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {JOB_STATUS_META[s].label}
                  </option>
                ))}
              </select>
            )}
            {trigger.type === 'task_status_changed' && (
              <select className="input" value={trigger.toStatus} onChange={(e) => setTrigger({ ...trigger, toStatus: e.target.value as never })}>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TASK_STATUS_META[s].label}
                  </option>
                ))}
              </select>
            )}
            {trigger.type === 'task_status_changed' ? (
              <select className="input" value={trigger.boardId ?? ''} onChange={(e) => setTrigger({ ...trigger, boardId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">on any board</option>
                {app.boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    on {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <select className="input" value={trigger.divisionId ?? ''} onChange={(e) => setTrigger({ ...trigger, divisionId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">in any division</option>
                {app.divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    in {d.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold">Then…</legend>
          <select
            className="input mb-3"
            value={action.type}
            onChange={(e) =>
              setAction(
                e.target.value === 'set_job_status'
                  ? { type: 'set_job_status', status: 'completed' }
                  : { type: 'create_task', boardId: app.boards[0]?.id, groupId: null, title: 'Follow up with {{client.name}}', priority: 'medium', dueInDays: 1 },
              )
            }
          >
            <option value="create_task">create a task</option>
            <option value="set_job_status">set the linked job's status</option>
          </select>

          {action.type === 'set_job_status' && (
            <select className="input" value={action.status} onChange={(e) => setAction({ ...action, status: e.target.value as never })}>
              {JOB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {JOB_STATUS_META[s].label}
                </option>
              ))}
            </select>
          )}

          {ct && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <span className="label">Task title</span>
                <input className="input" required value={ct.title} onChange={(e) => setCt({ title: e.target.value })} />
                <p className="mt-1 text-xs text-slate-500">
                  Placeholders: <code>{'{{job.number}}'}</code> <code>{'{{job.title}}'}</code> <code>{'{{client.name}}'}</code> <code>{'{{task.title}}'}</code>
                </p>
              </div>
              <div>
                <span className="label">Board</span>
                <select className="input" value={ct.boardId} onChange={(e) => setCt({ boardId: Number(e.target.value), groupId: null })}>
                  {app.boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="label">Group</span>
                <select className="input" value={ct.groupId ?? ''} onChange={(e) => setCt({ groupId: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">First group</option>
                  {board?.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="label">Assign to</span>
                <select
                  className="input"
                  value={ct.assignee ?? ''}
                  onChange={(e) => setCt({ assignee: e.target.value === 'job_assignee' ? 'job_assignee' : e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">Nobody</option>
                  <option value="job_assignee">The job's assigned tech</option>
                  {app.activeUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="label">Priority</span>
                  <select className="input" value={ct.priority ?? 'medium'} onChange={(e) => setCt({ priority: e.target.value as never })}>
                    {TASK_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {TASK_PRIORITY_META[p].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="label">Due in (days)</span>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={ct.dueInDays ?? ''}
                    onChange={(e) => setCt({ dueInDays: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          )}
        </fieldset>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button>{rule ? 'Save' : 'Create automation'}</Button>
        </div>
      </form>
    </Modal>
  );
}
