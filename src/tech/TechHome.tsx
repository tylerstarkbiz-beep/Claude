import { Link } from 'react-router-dom';
import { ChevronRight, MapPin } from 'lucide-react';
import { useApi } from '../api';
import { useApp } from '../store';
import { addDays, time, todayISO } from '../format';
import { Pill } from '../components/ui';
import { ClockCard, useClock } from './ClockCard';
import { JOB_STATUS_META, type Job } from '../../shared/types';

/** Tech home: the clock and today's visits. */
export function TechHome() {
  const app = useApp();
  const clock = useClock();
  const today = todayISO();
  const { data: jobs } = useApi<Job[]>(app.currentUserId ? `/jobs?assigneeId=${app.currentUserId}&from=${today}&to=${addDays(today, 1)}` : null);
  const { data: upcoming } = useApi<Job[]>(app.currentUserId ? `/jobs?assigneeId=${app.currentUserId}&from=${addDays(today, 1)}&to=${addDays(today, 8)}` : null);
  const sorted = [...(jobs ?? [])].sort((a, b) => (a.scheduledStart ?? '').localeCompare(b.scheduledStart ?? ''));

  return (
    <div className="space-y-5">
      <ClockCard clock={clock} />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-500">Today's visits ({sorted.length})</h2>
        <div className="space-y-3">
          {sorted.map((j) => (
            <JobCard key={j.id} job={j} active={clock.status?.entry?.jobId === j.id} />
          ))}
          {jobs && !sorted.length && <div className="card p-6 text-center text-sm text-slate-500">No visits scheduled today.</div>}
        </div>
      </section>

      {!!upcoming?.length && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">Coming up</h2>
          <div className="space-y-2">
            {[...upcoming]
              .sort((a, b) => (a.scheduledStart ?? '').localeCompare(b.scheduledStart ?? ''))
              .map((j) => (
                <Link key={j.id} to={`/tech/jobs/${j.id}`} className="card flex items-center gap-3 border-l-4 p-3" style={{ borderLeftColor: app.division(j.divisionId)?.color }}>
                  <div className="w-14 text-xs text-slate-500">{new Date(j.scheduledStart!).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}</div>
                  <div className="min-w-0 flex-1 truncate text-sm font-medium">{j.title}</div>
                  <ChevronRight size={16} className="text-slate-300" />
                </Link>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}

function JobCard({ job, active }: { job: Job; active: boolean }) {
  const app = useApp();
  const div = app.division(job.divisionId);
  return (
    <Link to={`/tech/jobs/${job.id}`} className={'card block border-l-4 p-4 ' + (active ? 'ring-2 ring-emerald-400' : '')} style={{ borderLeftColor: div?.color }}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">
          {time(job.scheduledStart)}
          {job.scheduledEnd && ` – ${time(job.scheduledEnd)}`}
        </span>
        <Pill label={JOB_STATUS_META[job.status].label} color={JOB_STATUS_META[job.status].color} />
      </div>
      <div className="mt-1 text-lg font-semibold leading-snug">{job.title}</div>
      {job.address && (
        <div className="mt-1 flex items-center gap-1 text-sm text-slate-500">
          <MapPin size={14} /> {job.address}
        </div>
      )}
      {active && <div className="mt-2 text-xs font-medium text-emerald-700">⏱ Timer running on this job</div>}
    </Link>
  );
}
