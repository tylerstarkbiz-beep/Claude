import { useEffect, useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import { api, post } from '../api';
import { useApp } from '../store';
import { Button, Modal } from './ui';
import type { Stage } from '../../shared/types';

type Kind = 'booking' | 'request_received' | 'quote_ready' | 'quote_followup' | 'custom';

/** What a text is about: a job, a quote, or a request (its assessment visit). */
export interface TextTarget {
  stage: Stage;
  id: number;
  /** Has a booked time (job visit or request assessment). */
  scheduled?: boolean;
}

const PATH: Record<Stage, string> = { request: 'requests', quote: 'quotes', job: 'jobs' };

const OPTIONS: { kind: Kind; label: string; when: (t: TextTarget) => boolean }[] = [
  { kind: 'booking', label: 'Booking confirmation', when: (t) => t.stage === 'job' && !!t.scheduled },
  { kind: 'booking', label: 'Assessment visit confirmation', when: (t) => t.stage === 'request' && !!t.scheduled },
  { kind: 'request_received', label: 'Request received', when: (t) => t.stage === 'request' },
  { kind: 'quote_ready', label: 'Quote ready (with approval link)', when: (t) => t.stage === 'quote' },
  { kind: 'quote_followup', label: 'Quote follow-up', when: (t) => t.stage === 'quote' },
  { kind: 'custom', label: 'Custom message', when: () => true },
];

/** "Text client" button and composer: pick a standard message, adjust the wording, send. */
export function TextClientButton({ job, onSent, className }: { job: TextTarget; onSent?: () => void; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} className={className}>
        <MessageSquareText size={16} /> Text
      </Button>
      {open && <TextComposer job={job} onClose={() => setOpen(false)} onSent={onSent} />}
    </>
  );
}

function TextComposer({ job, onClose, onSent }: { job: TextTarget; onClose: () => void; onSent?: () => void }) {
  const app = useApp();
  const options = OPTIONS.filter((o) => o.when(job));
  const [kind, setKind] = useState<Kind>(options[0].kind);
  const [body, setBody] = useState('');
  const [to, setTo] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ body: string; to: string | null; blocked: string | null }>(`/${PATH[job.stage]}/${job.id}/text/${kind}`).then((r) => {
      setBody(r.body);
      setTo(r.to);
      setBlocked(r.blocked);
    });
  }, [job.id, kind]);

  async function send() {
    setBusy(true);
    try {
      await post(`/${PATH[job.stage]}/${job.id}/text`, { kind, body });
      app.toast(`Text to ${to} queued`);
      onSent?.();
      onClose();
    } catch (e) {
      app.toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Text client" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <button
              key={o.kind}
              onClick={() => setKind(o.kind)}
              className={'rounded-full border px-3 py-1.5 text-sm ' + (kind === o.kind ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300')}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div>
          <span className="label">To {to ?? '(no number on file)'}</span>
          <textarea id="text-body" className="input" rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type your message" />
          <div className="mt-1 flex justify-between text-xs text-slate-500">
            <span>{body.includes('{link}') ? '{link} becomes a secure link to their customer portal.' : ''}</span>
            <span>{body.length} characters</span>
          </div>
        </div>
        {blocked && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">{blocked}.</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={send} disabled={busy || !!blocked || !body.trim()}>
            {busy ? 'Sending…' : 'Send text'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
