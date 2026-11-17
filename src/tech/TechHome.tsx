import { Link } from 'react-router-dom';
import { ChevronRight, MapPin } from 'lucide-react';
import { useApi } from '../api';
import { useApp } from '../store';
import { addDays, time, todayISO } from '../format';
import { Pill } from '../components/ui';
import { ClockCard, useClock } from './ClockCard';
import { JOB_STATUS_META, type Job, type ServiceRequest } from '../../shared/types';

/** Tech home: the clock and today's visits. */
export function TechHome() {
  const app = useApp();
  const clock = useClock();
  const today = todayISO();
  const { data: jobs } = useApi<Job[]>(app.currentUserId ? `/jobs?assigneeId=${app.currentUserId}&from=${today}&to=${addDays(today, 1)}` : null);
  const { data: upcoming } = useApi<Job[]>(app.currentUserId ? `/jobs?assigneeId=${app.currentUserId}&from=${addDays(today, 1)}&to=${addDays(today, 8)}` : null);
  const sorted = [...(jobs ?? [])].sort((a, b) => (a.scheduledStart ?? '').localeCompare(b.scheduledStart ?? ''));
  // Assessment visits (inspect & quote) booked for this tech, today and later.
  const { data: requests } = useApi<ServiceRequest[]>('/requests?open=1');
  const assessments = (requests ?? [])
    .filter((r) => r.assessmentAssigneeId === app.currentUserId && r.assessmentStart && r.assessmentStart.slice(0, 10) >= today)
    .sort((a, b) => a.assessmentStart!.localeCompare(b.assessmentStart!));

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

      {assessments.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">Assessment visits ({assessments.length})</h2>
          <div className="space-y-2">
            {assessments.map((r) => (
              <Link key={r.id} to={`/requests/${r.id}`} className="card flex items-center gap-3 border-l-4 p-3" style={{ borderLeftColor: app.division(r.divisionId)?.color }}>
                <div className="w-16 text-xs text-slate-500">
                  {r.assessmentStart!.slice(0, 10) === today ? 'Today' : new Date(r.assessmentStart!).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                  <div className="font-semibold text-slate-700">{time(r.assessmentStart)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.title}</div>
                  <div className="truncate text-xs text-slate-500">
                    {r.number} · {r.address}
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-300" />
              </Link>
            ))}
          </div>
        </section>
      )}

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
      {active && <div className="mt-2 text-xs font-medium text-emerald-700">⏱ You're clocked in to this job</div>}
    </Link>
  );
}
