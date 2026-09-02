import { ACTIVITY_TYPES } from '@/constants/activity-types';
import type { ActivityWithUser } from '@/types/domain';
import { formatDateTime } from '@/lib/format';

/**
 * Chronological activity timeline (spec §5, §13). Newest first. Every entry
 * shows when it happened, what it was, and who did it.
 */
export function ActivityTimeline({ activities }: { activities: ActivityWithUser[] }) {
  if (activities.length === 0) {
    return <p className="muted">No activity yet.</p>;
  }
  return (
    <ul className="timeline">
      {activities.map((a) => (
        <li key={a.id}>
          <span className="when">{formatDateTime(a.created_at)}</span>
          <span className="what">
            <strong>{ACTIVITY_TYPES[a.activity_type]?.label ?? a.activity_type}</strong>
            {a.description && <span> — {a.description}</span>}
            {a.user && <span className="who"> · {a.user.full_name}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
