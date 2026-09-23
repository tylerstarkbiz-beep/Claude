import { Fragment, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronDown, ChevronRight, Columns3, MessageSquare, Plus, Search, Table2, Trash2 } from 'lucide-react';
import { del, patch, post, useApi } from '../api';
import { useApp } from '../store';
import { shortDate, todayISO } from '../format';
import { Avatar, Button, DivisionBadge, PersonPicker, StatusBattery, StatusCell } from '../components/ui';
import { TaskDrawer, priorityOptions, statusOptions } from '../components/TaskDrawer';
import { TASK_STATUSES, TASK_STATUS_META, type BoardDetail, type Group, type Job, type Task, type TaskStatus } from '../../shared/types';

const GRID = 'grid grid-cols-[6px_minmax(240px,1fr)_64px_130px_120px_96px_120px]';
const GROUP_COLORS = ['#579bfc', '#a25ddc', '#00c875', '#fdab3d', '#e2445c', '#ff7575', '#0086c0', '#333333'];

export function BoardPage() {
  const { id } = useParams();
  const app = useApp();
  const navigate = useNavigate();
  const { data: board, setData, reload } = useApi<BoardDetail>(`/boards/${id}`);
  const { data: jobs } = useApi<Job[]>('/jobs');
  const [view, setView] = useState<'table' | 'kanban'>('table');
  const [search, setSearch] = useState('');
  const [person, setPerson] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [openTask, setOpenTask] = useState<number | null>(null);

  const jobById = useMemo(() => new Map(jobs?.map((j) => [j.id, j])), [jobs]);

  if (!board) return <div className="text-slate-400">Loading board…</div>;

  const matches = (t: Task) =>
    (!search || t.title.toLowerCase().includes(search.toLowerCase())) && (!person || t.assigneeId === person);
  const topLevel = board.tasks.filter((t) => !t.parentId);
  const visible = topLevel.filter(matches);
  const subtasksOf = (taskId: number) => board.tasks.filter((t) => t.parentId === taskId);

  async function update(taskId: number, changes: Partial<Task>) {
    setData((b) => b && { ...b, tasks: b.tasks.map((t) => (t.id === taskId ? { ...t, ...changes } : t)) });
    try {
      const res = await patch<Task & { automations?: string[] }>(`/tasks/${taskId}`, changes);
      app.announce(res);
      if (res.automations?.length || 'status' in changes) reload();
    } catch (e) {
      app.toast((e as Error).message, 'error');
      reload();
    }
  }

  async function addTask(groupId: number, title: string, parentId?: number) {
    if (!title.trim()) return;
    await post('/tasks', { boardId: board!.id, groupId, parentId, title, assigneeId: parentId ? undefined : person });
    reload();
  }

  async function addGroup() {
    const name = prompt('Group name');
    if (!name) return;
    await post(`/boards/${board!.id}/groups`, { name, color: GROUP_COLORS[board!.groups.length % GROUP_COLORS.length] });
    reload();
  }

  async function renameBoard(name: string) {
    if (!name.trim() || name === board!.name) return;
    await patch(`/boards/${board!.id}`, { name });
    app.reload();
    reload();
  }

  async function deleteBoard() {
    if (!confirm(`Delete board "${board!.name}" and all its tasks?`)) return;
    await del(`/boards/${board!.id}`);
    await app.reload();
    navigate('/');
  }

  const people = app.users.filter((u) => board.tasks.some((t) => t.assigneeId === u.id));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <input
            key={board.name}
            defaultValue={board.name}
            onBlur={(e) => renameBoard(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="-ml-1 rounded px-1 text-2xl font-bold tracking-tight outline-none hover:bg-white focus:bg-white"
          />
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            <DivisionBadge division={app.division(board.divisionId)} />
            {board.description}
          </div>
        </div>
        <Button variant="danger" onClick={deleteBoard}>
          <Trash2 size={15} /> Delete board
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
          {(
            [
              ['table', 'Main table', Table2],
              ['kanban', 'Kanban', Columns3],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={clsx('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm', view === v ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-600')}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input className="input w-52 pl-8" placeholder="Search tasks" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1">
          <span className="mr-1 text-xs text-slate-500">Person</span>
          {people.map((u) => (
            <button key={u.id} onClick={() => setPerson(person === u.id ? null : u.id)} className={clsx('rounded-full', person === u.id ? 'ring-2 ring-indigo-500 ring-offset-1' : 'opacity-80')}>
              <Avatar user={u} size={24} />
            </button>
          ))}
        </div>
        <Button variant="secondary" onClick={addGroup}>
          <Plus size={15} /> New group
        </Button>
      </div>

      {view === 'table' ? (
        <div className="space-y-8 overflow-x-auto pb-24">
          {board.groups.map((g) => (
            <GroupTable
              key={g.id}
              group={g}
              tasks={visible.filter((t) => t.groupId === g.id)}
              collapsed={collapsed.has(g.id)}
              onToggle={() => setCollapsed((s) => toggle(s, g.id))}
              expanded={expanded}
              onExpand={(tid) => setExpanded((s) => toggle(s, tid))}
              subtasksOf={subtasksOf}
              jobById={jobById}
              onUpdate={update}
              onAdd={addTask}
              onOpen={setOpenTask}
              onGroupChange={async (changes) => (await patch(`/groups/${g.id}`, changes), reload())}
              onGroupDelete={async () => {
                if (!confirm(`Delete group "${g.name}" and its tasks?`)) return;
                await del(`/groups/${g.id}`).catch((e) => app.toast(e.message, 'error'));
                reload();
              }}
            />
          ))}
        </div>
      ) : (
        <Kanban tasks={visible} jobById={jobById} onUpdate={update} onOpen={setOpenTask} />
      )}

      {openTask && <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} onChanged={reload} />}
    </div>
  );
}

function toggle(set: Set<number>, id: number) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

interface GroupProps {
  group: Group;
  tasks: Task[];
  collapsed: boolean;
  onToggle: () => void;
  expanded: Set<number>;
  onExpand: (id: number) => void;
  subtasksOf: (id: number) => Task[];
  jobById: Map<number, Job>;
  onUpdate: (id: number, changes: Partial<Task>) => void;
  onAdd: (groupId: number, title: string, parentId?: number) => void;
  onOpen: (id: number) => void;
  onGroupChange: (changes: Partial<Group>) => void;
  onGroupDelete: () => void;
}

function GroupTable(p: GroupProps) {
  const [newTitle, setNewTitle] = useState('');
  const counts = Object.fromEntries(TASK_STATUSES.map((s) => [s, p.tasks.filter((t) => t.status === s).length]));

  return (
    <section className="min-w-[860px]">
      <div className="group mb-1 flex items-center gap-2">
        <button onClick={p.onToggle} style={{ color: p.group.color }}>
          {p.collapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
        </button>
        <input
          key={p.group.name}
          defaultValue={p.group.name}
          onBlur={(e) => e.target.value.trim() && e.target.value !== p.group.name && p.onGroupChange({ name: e.target.value.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="rounded bg-transparent px-1 font-semibold outline-none hover:bg-white focus:bg-white"
          style={{ color: p.group.color }}
        />
        <span className="text-xs text-slate-400">{p.tasks.length} items</span>
        <input
          type="color"
          value={p.group.color}
          onChange={(e) => p.onGroupChange({ color: e.target.value })}
          className="invisible h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0 group-hover:visible"
          title="Group color"
        />
        <button onClick={p.onGroupDelete} className="invisible text-slate-400 hover:text-rose-600 group-hover:visible" title="Delete group">
          <Trash2 size={14} />
        </button>
      </div>

      {!p.collapsed && (
        <div className="overflow-visible rounded-md border border-slate-200 bg-white">
          <div className={clsx(GRID, 'border-b border-slate-200 text-xs text-slate-500')}>
            <div style={{ background: p.group.color }} className="rounded-tl-md" />
            <div className="flex h-9 items-center px-3">Task</div>
            <div className="cell">Owner</div>
            <div className="cell">Status</div>
            <div className="cell">Priority</div>
            <div className="cell">Due</div>
            <div className="cell">Job</div>
          </div>

          {p.tasks.map((t) => (
            <Fragment key={t.id}>
              <TaskRow task={t} color={p.group.color} job={t.jobId ? p.jobById.get(t.jobId) : undefined} {...p} />
              {p.expanded.has(t.id) && (
                <div className="border-b border-slate-200 bg-slate-50/60 py-1 pl-10">
                  {p.subtasksOf(t.id).map((s) => (
                    <TaskRow key={s.id} task={s} color={p.group.color} sub job={s.jobId ? p.jobById.get(s.jobId) : undefined} {...p} />
                  ))}
                  <AddRow placeholder="+ Add subtask" onAdd={(title) => p.onAdd(t.groupId, title, t.id)} color={p.group.color} />
                </div>
              )}
            </Fragment>
          ))}

          <div className={clsx(GRID)}>
            <div style={{ background: p.group.color, opacity: 0.4 }} />
            <input
              className="h-9 px-3 text-sm outline-none placeholder:text-slate-400 focus:bg-indigo-50/40"
              placeholder="+ Add task"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newTitle.trim()) {
                  p.onAdd(p.group.id, newTitle);
                  setNewTitle('');
                }
              }}
            />
            <div className="col-span-5 border-l border-slate-100" />
          </div>
          <div className={clsx(GRID, 'border-t border-slate-200')}>
            <div />
            <div />
            <div className="cell" />
            <div className="cell px-2">
              <StatusBattery counts={counts} meta={TASK_STATUS_META} />
            </div>
            <div className="col-span-3 border-l border-slate-200" />
          </div>
        </div>
      )}
    </section>
  );
}

function TaskRow({
  task,
  color,
  job,
  sub,
  onUpdate,
  onOpen,
  onExpand,
  expanded,
}: { task: Task; color: string; job?: Job; sub?: boolean } & Pick<GroupProps, 'onUpdate' | 'onOpen' | 'onExpand' | 'expanded'>) {
  const overdue = task.dueDate && task.status !== 'done' && task.dueDate < todayISO();
  return (
    <div className={clsx(GRID, 'group border-b border-slate-200 last:border-b-0 hover:bg-slate-50', sub && 'rounded-l border-l border-t')}>
      <div style={{ background: color }} />
      <div className="flex h-9 min-w-0 items-center gap-2 px-3">
        {!sub && (
          <button
            onClick={() => onExpand(task.id)}
            className={clsx('flex shrink-0 items-center text-slate-400 hover:text-slate-700', !task.subtaskCount && 'invisible group-hover:visible')}
            title="Subtasks"
          >
            {expanded.has(task.id) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            {!!task.subtaskCount && (
              <span className="rounded bg-slate-100 px-1 text-[10px]">
                {task.subtaskDoneCount}/{task.subtaskCount}
              </span>
            )}
          </button>
        )}
        <button onClick={() => onOpen(task.id)} className={clsx('truncate text-left text-sm hover:underline', task.status === 'done' && 'text-slate-400')}>
          {task.title}
        </button>
        <button onClick={() => onOpen(task.id)} className="ml-auto flex shrink-0 items-center gap-0.5 text-slate-300 hover:text-indigo-600" title="Updates">
          <MessageSquare size={15} />
          {!!task.updateCount && <span className="text-[10px] text-indigo-600">{task.updateCount}</span>}
        </button>
      </div>
      <div className="cell">
        <PersonPicker value={task.assigneeId} onChange={(assigneeId) => onUpdate(task.id, { assigneeId })} size={24} />
      </div>
      <div className="cell">
        <StatusCell value={task.status} options={statusOptions} onChange={(status) => onUpdate(task.id, { status })} />
      </div>
      <div className="cell">
        <StatusCell value={task.priority} options={priorityOptions} onChange={(priority) => onUpdate(task.id, { priority })} />
      </div>
      <div className={clsx('cell relative', overdue && 'text-rose-600')}>
        <span className="pointer-events-none text-xs">{task.dueDate ? shortDate(task.dueDate) : <span className="text-slate-300">—</span>}</span>
        <input
          type="date"
          className="absolute inset-0 cursor-pointer opacity-0"
          value={task.dueDate ?? ''}
          onChange={(e) => onUpdate(task.id, { dueDate: e.target.value || null })}
        />
      </div>
      <div className="cell truncate px-2 text-xs">
        {job ? (
          <Link to={`/jobs/${job.id}`} className="truncate rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700 hover:bg-indigo-100" title={job.title}>
            {job.number}
          </Link>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </div>
    </div>
  );
}

function AddRow({ placeholder, onAdd, color }: { placeholder: string; onAdd: (title: string) => void; color: string }) {
  const [v, setV] = useState('');
  return (
    <div className={clsx(GRID)}>
      <div style={{ background: color, opacity: 0.3 }} />
      <input
        className="h-8 bg-transparent px-3 text-sm outline-none placeholder:text-slate-400"
        placeholder={placeholder}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && v.trim()) {
            onAdd(v);
            setV('');
          }
        }}
      />
    </div>
  );
}

function Kanban({
  tasks,
  jobById,
  onUpdate,
  onOpen,
}: {
  tasks: Task[];
  jobById: Map<number, Job>;
  onUpdate: (id: number, changes: Partial<Task>) => void;
  onOpen: (id: number) => void;
}) {
  const app = useApp();
  const [over, setOver] = useState<TaskStatus | null>(null);
  return (
    <div className="flex gap-4 overflow-x-auto pb-8">
      {TASK_STATUSES.map((status) => {
        const meta = TASK_STATUS_META[status];
        const col = tasks.filter((t) => t.status === status);
        return (
          <div
            key={status}
            className={clsx('w-72 shrink-0 rounded-lg bg-slate-100 p-2', over === status && 'ring-2 ring-indigo-400')}
            onDragOver={(e) => (e.preventDefault(), setOver(status))}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              setOver(null);
              const id = Number(e.dataTransfer.getData('text/plain'));
              if (id && tasks.find((t) => t.id === id)?.status !== status) onUpdate(id, { status });
            }}
          >
            <div className="mb-2 rounded px-3 py-2 text-sm font-medium text-white" style={{ background: meta.color }}>
              {meta.label} <span className="opacity-80">/ {col.length}</span>
            </div>
            <div className="space-y-2">
              {col.map((t) => {
                const job = t.jobId ? jobById.get(t.jobId) : undefined;
                return (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', String(t.id))}
                    onClick={() => onOpen(t.id)}
                    className="cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:shadow"
                  >
                    <div className="mb-2 text-sm font-medium">{t.title}</div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Avatar user={app.user(t.assigneeId)} size={22} />
                      {t.dueDate && <span className={clsx(t.dueDate < todayISO() && t.status !== 'done' && 'text-rose-600')}>{shortDate(t.dueDate)}</span>}
                      {job && <span className="rounded bg-slate-100 px-1.5 py-0.5">{job.number}</span>}
                      {!!t.subtaskCount && (
                        <span className="ml-auto">
                          {t.subtaskDoneCount}/{t.subtaskCount}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
