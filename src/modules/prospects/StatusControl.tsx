import { useState } from 'react';
import { allowedTransitions, PIPELINE_STATUS_LABEL, type PipelineStatus } from '@/constants/pipeline';
import { useProspectMutations } from './prospect-queries';

/**
 * Status change control. The dropdown only offers transitions permitted by
 * canTransition() for the current status; the DB trigger enforces the same set.
 * Moving to "lost" requires a reason.
 */
export function StatusControl({ prospectId, current }: { prospectId: string; current: PipelineStatus }) {
  const { changeStatus } = useProspectMutations(prospectId);
  const options = allowedTransitions(current);
  const [target, setTarget] = useState<PipelineStatus | ''>('');
  const [reason, setReason] = useState('');
  const [lostReason, setLostReason] = useState('');

  if (options.length === 0) {
    return <p className="muted">No status changes available from “{PIPELINE_STATUS_LABEL[current]}”.</p>;
  }

  const submit = () => {
    if (!target) return;
    changeStatus.mutate(
      { id: prospectId, to: target, reason: reason || undefined, lostReason: target === 'lost' ? lostReason : undefined },
      {
        onSuccess: () => {
          setTarget('');
          setReason('');
          setLostReason('');
        },
      },
    );
  };

  return (
    <div className="stack">
      <div className="row">
        <select value={target} onChange={(e) => setTarget(e.target.value as PipelineStatus | '')}>
          <option value="">Change status to…</option>
          {options.map((s) => <option key={s} value={s}>{PIPELINE_STATUS_LABEL[s]}</option>)}
        </select>
        <input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-background)', color: 'inherit' }} />
        <button className="btn primary" onClick={submit}
          disabled={!target || changeStatus.isPending || (target === 'lost' && lostReason.trim().length === 0)}>
          {changeStatus.isPending ? 'Saving…' : 'Apply'}
        </button>
      </div>
      {target === 'lost' && (
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="lostReason">Lost reason (required)</label>
          <input id="lostReason" value={lostReason} onChange={(e) => setLostReason(e.target.value)} />
        </div>
      )}
      {changeStatus.isError && <div className="warn">{(changeStatus.error as Error).message}</div>}
    </div>
  );
}
