import { useState } from 'react';
import { MANUAL_ACTIVITY_TYPES, ACTIVITY_TYPES } from '@/constants/activity-types';
import { useProspectMutations } from './prospect-queries';

/** Log a manual outreach activity (spec §5). System activity types are not offered. */
export function LogActivityControl({ prospectId }: { prospectId: string }) {
  const { logActivity } = useProspectMutations(prospectId);
  const [type, setType] = useState(MANUAL_ACTIVITY_TYPES[0] ?? 'dm_sent');
  const [description, setDescription] = useState('');

  return (
    <div className="row">
      <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
        {MANUAL_ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{ACTIVITY_TYPES[t].label}</option>)}
      </select>
      <input placeholder="What happened? (optional)" value={description} onChange={(e) => setDescription(e.target.value)}
        style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-background)', color: 'inherit' }} />
      <button className="btn" disabled={logActivity.isPending}
        onClick={() =>
          logActivity.mutate(
            { id: prospectId, type, description: description || undefined },
            { onSuccess: () => setDescription('') },
          )
        }>
        {logActivity.isPending ? 'Logging…' : 'Log'}
      </button>
      {logActivity.isError && <div className="warn">{(logActivity.error as Error).message}</div>}
    </div>
  );
}
