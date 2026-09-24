import { useEffect, useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import { api, post } from '../api';
import { useApp } from '../store';
import { Button, Modal } from './ui';
import type { Job } from '../../shared/types';

type Kind = 'booking' | 'request_received' | 'quote_ready' | 'custom';

const OPTIONS: { kind: Kind; label: string; when: (j: Job) => boolean }[] = [
  { kind: 'booking', label: 'Booking confirmation', when: (j) => !!j.scheduledStart },
  { kind: 'request_received', label: 'Request received', when: (j) => j.status === 'request' },
  { kind: 'quote_ready', label: 'Estimate ready (with approval link)', when: (j) => j.status === 'quoted' },
  { kind: 'custom', label: 'Custom message', when: () => true },
];

/** "Text client" button and composer: pick a standard message, adjust the wording, send. */
export function TextClientButton({ job, onSent, className }: { job: Job; onSent?: () => void; className?: string }) {
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

function TextComposer({ job, onClose, onSent }: { job: Job; onClose: () => void; onSent?: () => void }) {
  const app = useApp();
  const options = OPTIONS.filter((o) => o.when(job));
  const [kind, setKind] = useState<Kind>(options[0].kind);
  const [body, setBody] = useState('');
  const [to, setTo] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ body: string; to: string | null; blocked: string | null }>(`/jobs/${job.id}/text/${kind}`).then((r) => {
      setBody(r.body);
      setTo(r.to);
      setBlocked(r.blocked);
    });
  }, [job.id, kind]);

  async function send() {
    setBusy(true);
    try {
      await post(`/jobs/${job.id}/text`, { kind, body });
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
