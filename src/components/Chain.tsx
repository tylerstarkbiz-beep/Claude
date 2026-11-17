import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronRight, ClipboardList, FileSignature, Receipt, Wrench } from 'lucide-react';
import { useApi } from '../api';
import { money } from '../format';
import { INVOICE_STATUS_META, JOB_STATUS_META, QUOTE_STATUS_META, REQUEST_STATUS_META, type Chain } from '../../shared/types';

type Kind = 'request' | 'quote' | 'job' | 'invoice';

interface Step {
  kind: Kind;
  label: string;
  icon: typeof Wrench;
  to?: string;
  number?: string;
  status?: string;
  color?: string;
  extra?: string;
  current: boolean;
}

/**
 * Request → Quote → Job → Invoice, from any step. Each existing step links to its page;
 * the current one is highlighted, steps not reached yet are dimmed.
 */
export function ChainBar({ kind, id, chain: given, compact }: { kind: Kind; id: number; chain?: Chain; compact?: boolean }) {
  const { data } = useApi<Chain>(given ? null : `/${kind}s/${id}/chain`);
  const chain = given ?? data;
  if (!chain) return <div className="h-14 animate-pulse rounded-lg bg-slate-100" />;
  return <ChainSteps chain={chain} kind={kind} id={id} compact={compact} />;
}

export function ChainSteps({ chain, kind, id, compact }: { chain: Chain; kind?: Kind; id?: number; compact?: boolean }) {
  const steps: Step[] = [
    {
      kind: 'request',
      label: 'Request',
      icon: ClipboardList,
      to: chain.request ? `/requests/${chain.request.id}` : undefined,
      number: chain.request?.number,
      status: chain.request ? REQUEST_STATUS_META[chain.request.status].label : undefined,
      color: chain.request ? REQUEST_STATUS_META[chain.request.status].color : undefined,
      current: kind === 'request' && chain.request?.id === id,
    },
    {
      kind: 'quote',
      label: 'Quote',
      icon: FileSignature,
      to: chain.quote ? `/quotes/${chain.quote.id}` : undefined,
      number: chain.quote?.number,
      status: chain.quote ? QUOTE_STATUS_META[chain.quote.status].label : undefined,
      color: chain.quote ? QUOTE_STATUS_META[chain.quote.status].color : undefined,
      extra: chain.quote ? money(chain.quote.total) : undefined,
      current: kind === 'quote' && chain.quote?.id === id,
    },
    {
      kind: 'job',
      label: 'Job',
      icon: Wrench,
      to: chain.job ? `/jobs/${chain.job.id}` : undefined,
      number: chain.job?.number,
      status: chain.job ? JOB_STATUS_META[chain.job.status].label : undefined,
      color: chain.job ? JOB_STATUS_META[chain.job.status].color : undefined,
      current: kind === 'job' && chain.job?.id === id,
    },
  ];
  const invoices = chain.invoices.length ? chain.invoices : [null];

  return (
    <nav aria-label="Request to invoice history" className={clsx('flex flex-wrap items-stretch gap-1', compact ? 'text-xs' : 'text-sm')}>
      {steps.map((s) => (
        <Fragment key={s.kind}>
          <StepBox step={s} compact={compact} />
          <ChevronRight size={16} className="shrink-0 self-center text-slate-300" />
        </Fragment>
      ))}
      <div className="flex flex-wrap gap-1">
        {invoices.map((inv, i) => (
          <StepBox
            key={inv?.id ?? i}
            compact={compact}
            step={{
              kind: 'invoice',
              label: inv?.kind === 'deposit' ? 'Deposit' : 'Invoice',
              icon: Receipt,
              to: inv ? `/invoices/${inv.id}` : undefined,
              number: inv?.number,
              status: inv ? INVOICE_STATUS_META[inv.status].label : undefined,
              color: inv ? INVOICE_STATUS_META[inv.status].color : undefined,
              extra: inv ? money(inv.total) : undefined,
              current: kind === 'invoice' && inv?.id === id,
            }}
          />
        ))}
      </div>
    </nav>
  );
}

function StepBox({ step, compact }: { step: Step; compact?: boolean }) {
  const Icon = step.icon;
  const inner = (
    <>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        <Icon size={12} /> {step.label}
      </div>
      {step.number ? (
        <div className="flex flex-wrap items-center gap-x-1.5">
          <span className="font-semibold text-slate-800">{step.number}</span>
          {!compact && step.extra && <span className="text-slate-500">{step.extra}</span>}
        </div>
      ) : (
        <div className="text-slate-400">—</div>
      )}
      {step.status && (
        <div className="flex items-center gap-1 text-xs text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: step.color }} /> {step.status}
        </div>
      )}
    </>
  );
  const cls = clsx(
    'min-w-24 rounded-lg border px-2.5 py-1.5',
    step.current
      ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
      : step.number
        ? 'border-slate-200 bg-white hover:border-brand-300'
        : 'border-dashed border-slate-200 bg-slate-50/50',
  );
  return step.to && !step.current ? (
    <Link to={step.to} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls} aria-current={step.current ? 'step' : undefined}>
      {inner}
    </div>
  );
}
