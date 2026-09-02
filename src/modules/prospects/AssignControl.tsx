import { useState } from 'react';
import { useProspectMutations, useStaffList } from './prospect-queries';

/** Admin-only assignment / reassignment. The DB trigger rejects this for non-admins. */
export function AssignControl({
  prospectId,
  currentSalespersonId,
  isPaid,
}: {
  prospectId: string;
  currentSalespersonId: string | null;
  isPaid: boolean;
}) {
  const { data: staff } = useStaffList();
  const { assign } = useProspectMutations(prospectId);
  const [target, setTarget] = useState<string>(currentSalespersonId ?? '');
  const [reason, setReason] = useState('');

  return (
    <div className="stack">
      {isPaid && (
        <div className="warn moderate">
          This prospect has converted. Changing attribution is recorded in the audit log.
        </div>
      )}
      <div className="row">
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Unassigned</option>
          {(staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
        </select>
        <input placeholder={isPaid ? 'Reason (required for a converted prospect)' : 'Reason (optional)'}
          value={reason} onChange={(e) => setReason(e.target.value)}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-background)', color: 'inherit' }} />
        <button className="btn primary"
          disabled={assign.isPending || target === (currentSalespersonId ?? '') || (isPaid && reason.trim().length === 0)}
          onClick={() => assign.mutate({ id: prospectId, salespersonId: target || null, reason: reason || undefined })}>
          {assign.isPending ? 'Saving…' : 'Assign'}
        </button>
      </div>
      {assign.isError && <div className="warn">{(assign.error as Error).message}</div>}
    </div>
  );
}
