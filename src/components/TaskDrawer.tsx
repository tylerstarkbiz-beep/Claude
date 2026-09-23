import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ExternalLink, Plus, Send, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { del, patch, post, useApi } from '../api';
import { useApp } from '../store';
import { relative } from '../format';
import { Avatar, Button, Drawer, PersonPicker, StatusCell } from './ui';
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_META,
  TASK_STATUSES,
  TASK_STATUS_META,
  type Job,
  type Task,
  type TaskDetail,
  type TaskUpdate,
} from '../../shared/types';

export const statusOptions = TASK_STATUSES.map((s) => ({ value: s, ...TASK_STATUS_META[s] }));
export const priorityOptions = TASK_PRIORITIES.map((p) => ({ value: p, ...TASK_PRIORITY_META[p] }));

export function TaskDrawer({ taskId, onClose, onChanged }: { taskId: number; onClose: () => void; onChanged: () => void }) {
  const app = useApp();
  const { data: task, setData, reload } = useApi<TaskDetail>(`/tasks/${taskId}`);
  const { data: jobs } = useApi<Job[]>('/jobs');
  const [update, setUpdate] = useState('');
  const [subtask, setSubtask] = useState('');

  if (!task) return <Drawer onClose={onClose}><div className="p-6 text-slate-400">Loading…</div></Drawer>;

  async function save(changes: Partial<Task>) {
    setData((t) => (t ? { ...t, ...changes } : t));
    const res = await patch<Task & { automations?: string[] }>(`/tasks/${taskId}`, changes).catch((e) => {
      app.toast(e.message, 'error');
      return null;
    });
    if (res) app.announce(res);
    onChanged();
  }

  async function addSubtask() {
    if (!subtask.trim() || !task) return;
    await post('/tasks', { boardId: task.boardId, parentId: task.id, title: subtask, assigneeId: task.assigneeId });
    setSubtask('');
    reload();
    onChanged();
  }

  async function toggleSubtask(s: Task) {
    await patch(`/tasks/${s.id}`, { status: s.status === 'done' ? 'not_started' : 'done' });
    reload();
    onChanged();
  }

  async function postUpdate() {
    if (!update.trim()) return;
    await post<TaskUpdate>(`/tasks/${taskId}/updates`, { body: update, authorId: app.currentUserId });
    setUpdate('');
    reload();
    onChanged();
  }

  async function remove() {
    if (!confirm('Delete this task and its subtasks?')) return;
    await del(`/tasks/${taskId}`);
    onChanged();
    onClose();
  }

  const job = jobs?.find((j) => j.id === task.jobId);
  const board = app.boards.find((b) => b.id === task.boardId);

  return (
    <Drawer onClose={onClose}>
      <div className="border-b border-slate-200 p-5">
        <div className="mb-2 text-xs text-slate-400">{board?.name}</div>
        <input
          className="w-full rounded px-1 text-xl font-semibold outline-none hover:bg-slate-50 focus:bg-slate-50"
          defaultValue={task.title}
          key={task.id}
          onBlur={(e) => e.target.value.trim() && e.target.value !== task.title && save({ title: e.target.value.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>

      <div className="grid grid-cols-[110px_1fr] items-center gap-x-4 gap-y-3 p-5 text-sm">
        <span className="text-slate-500">Status</span>
        <div className="h-8 w-40 overflow-visible rounded">
          <StatusCell value={task.status} options={statusOptions} onChange={(status) => save({ status })} className="rounded" />
        </div>
        <span className="text-slate-500">Priority</span>
        <div className="h-8 w-40 rounded">
          <StatusCell value={task.priority} options={priorityOptions} onChange={(priority) => save({ priority })} className="rounded" />
        </div>
        <span className="text-slate-500">Owner</span>
        <div className="flex items-center gap-2">
          <PersonPicker value={task.assigneeId} onChange={(assigneeId) => save({ assigneeId })} />
          <span>{app.user(task.assigneeId)?.name ?? 'Unassigned'}</span>
        </div>
        <span className="text-slate-500">Due</span>
        <input type="date" className="input w-44" value={task.dueDate ?? ''} onChange={(e) => save({ dueDate: e.target.value || null })} />
        <span className="text-slate-500">Linked job</span>
        <div className="flex items-center gap-2">
          <select className="input" value={task.jobId ?? ''} onChange={(e) => save({ jobId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">— none —</option>
            {jobs?.map((j) => (
              <option key={j.id} value={j.id}>
                {j.number} · {j.title}
              </option>
            ))}
          </select>
          {job && (
            <Link to={`/jobs/${job.id}`} onClick={onClose} className="text-indigo-600 hover:text-indigo-800" title="Open job">
              <ExternalLink size={16} />
            </Link>
          )}
        </div>
      </div>

      <section className="border-t border-slate-200 p-5">
        <h3 className="mb-3 text-sm font-semibold">
          Subtasks{' '}
          <span className="font-normal text-slate-400">
            {task.subtasks.filter((s) => s.status === 'done').length}/{task.subtasks.length}
          </span>
        </h3>
        <div className="space-y-1">
          {task.subtasks.map((s) => (
            <div key={s.id} className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-slate-50">
              <button
                onClick={() => toggleSubtask(s)}
                className={clsx(
                  'grid h-5 w-5 place-items-center rounded border',
                  s.status === 'done' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300',
                )}
              >
                {s.status === 'done' && <Check size={13} />}
              </button>
              <span className={clsx('flex-1 text-sm', s.status === 'done' && 'text-slate-400 line-through')}>{s.title}</span>
              <Avatar user={app.user(s.assigneeId)} size={20} />
              <button
                className="invisible text-slate-400 hover:text-rose-600 group-hover:visible"
                onClick={async () => (await del(`/tasks/${s.id}`), reload(), onChanged())}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            className="input"
            placeholder="Add a subtask…"
            value={subtask}
            onChange={(e) => setSubtask(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
          />
          <Button variant="secondary" onClick={addSubtask}>
            <Plus size={15} />
          </Button>
        </div>
      </section>

      <section className="border-t border-slate-200 p-5">
        <h3 className="mb-3 text-sm font-semibold">Updates</h3>
        <div className="mb-4 flex gap-2">
          <textarea
            className="input"
            rows={2}
            placeholder="Write an update… (Ctrl+Enter to post)"
            value={update}
            onChange={(e) => setUpdate(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && postUpdate()}
          />
          <Button onClick={postUpdate} className="self-start">
            <Send size={15} />
          </Button>
        </div>
        <div className="space-y-3">
          {task.updates.map((u) => (
            <div key={u.id} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                <Avatar user={app.user(u.authorId)} size={20} />
                <span className="font-medium text-slate-700">{app.user(u.authorId)?.name ?? 'Someone'}</span>
                <span>· {relative(u.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{u.body}</p>
            </div>
          ))}
          {!task.updates.length && <p className="text-sm text-slate-400">No updates yet.</p>}
        </div>
      </section>

      <div className="border-t border-slate-200 p-5">
        <Button variant="danger" onClick={remove}>
          <Trash2 size={15} /> Delete task
        </Button>
      </div>
    </Drawer>
  );
}
