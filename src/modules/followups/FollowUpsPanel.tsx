import { Link } from 'react-router-dom';
import { useFollowUps } from './followup-queries';
import type { FollowUpProspect } from './followup-buckets';
import { formatDate, relativeDay } from '@/lib/format';

/**
 * Follow-up reminders (spec §6, §17 — "who do I contact today?"). Compact
 * dashboard view: counts + the most urgent items. RLS-scoped.
 */
export function FollowUpsPanel({ showOwner, limit = 5 }: { showOwner?: boolean; limit?: number }) {
  const { derived, isLoading, error } = useFollowUps();

  return (
    <div className="card">
      <div className="spread" style={{ marginBottom: 12 }}>
        <h3>Follow-ups</h3>
        <Link to="/follow-ups" style={{ fontSize: '0.85rem' }}>View all →</Link>
      </div>

      {error && <div className="warn">{(error as Error).message}</div>}
      {isLoading && <p className="muted">Loading…</p>}

      {derived && (
        <>
          <div className="grid cols-auto" style={{ marginBottom: 12 }}>
            <Count label="Overdue" value={derived.counts.overdue} tone="var(--color-clay-red)" />
            <Count label="Due today" value={derived.counts.dueToday} tone="var(--color-gold)" />
            <Count label="Upcoming" value={derived.counts.upcoming} tone="var(--color-text-muted)" />
          </div>

          <Section title="Overdue" items={derived.buckets.overdue} limit={limit} showOwner={showOwner} tone="var(--color-clay-red)" />
          <Section title="Due today" items={derived.buckets.dueToday} limit={limit} showOwner={showOwner} tone="var(--color-gold)" />

          {derived.counts.overdue + derived.counts.dueToday === 0 && (
            <p className="muted" style={{ fontSize: '0.9rem' }}>Nothing due. 🎉</p>
          )}
        </>
      )}
    </div>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className="value" style={{ color: value > 0 ? tone : undefined }}>{value}</span>
    </div>
  );
}

export function Section({
  title,
  items,
  limit,
  showOwner,
  tone,
}: {
  title: string;
  items: FollowUpProspect[];
  limit?: number;
  showOwner?: boolean;
  tone: string;
}) {
  if (items.length === 0) return null;
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="muted" style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 4 }}>
        {title}
      </div>
      <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 6 }}>
        {shown.map((it) => (
          <li key={it.id} className="spread" style={{ fontSize: '0.9rem', alignItems: 'baseline' }}>
            <span>
              <Link to={`/prospects/${it.id}`}>{it.businessName}</Link>
              {showOwner && it.ownerName && <span className="muted"> · {it.ownerName}</span>}
              {it.followUpNote && <div className="muted" style={{ fontSize: '0.82rem' }}>{it.followUpNote}</div>}
            </span>
            <span className="num" style={{ color: tone, whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
              {relativeDay(it.nextFollowUpAt)} · {formatDate(it.nextFollowUpAt)}
            </span>
          </li>
        ))}
      </ul>
      {limit && items.length > limit && (
        <p className="muted" style={{ fontSize: '0.8rem', margin: '4px 0 0' }}>+{items.length - limit} more</p>
      )}
    </div>
  );
}
