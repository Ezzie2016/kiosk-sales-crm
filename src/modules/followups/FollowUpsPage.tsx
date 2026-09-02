import { useFollowUps } from './followup-queries';
import { Section } from './FollowUpsPanel';
import { useAuth } from '@/modules/auth/use-auth';
import { canViewAllProspects } from '@/modules/authorization/permissions';

/** Full follow-up list (spec §6) — Overdue / Due today / Upcoming, RLS-scoped. */
export function FollowUpsPage() {
  const { actor } = useAuth();
  const showOwner = actor ? canViewAllProspects(actor) : false;
  const { derived, isLoading, error } = useFollowUps();

  return (
    <div className="content">
      <div className="page-head">
        <h1>Follow-ups</h1>
        <span className="muted" style={{ fontSize: '0.85rem' }}>Day boundary: Africa/Lagos.</span>
      </div>

      {error && <div className="warn">{(error as Error).message}</div>}
      {isLoading && <p className="muted">Loading…</p>}

      {derived && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="card">
            <div className="grid cols-auto">
              <Stat label="Overdue" value={derived.counts.overdue} tone="var(--color-clay-red)" />
              <Stat label="Due today" value={derived.counts.dueToday} tone="var(--color-gold)" />
              <Stat label="Upcoming" value={derived.counts.upcoming} tone="var(--color-text-muted)" />
            </div>
          </div>

          <div className="card">
            <Section title="Overdue" items={derived.buckets.overdue} showOwner={showOwner} tone="var(--color-clay-red)" />
            <Section title="Due today" items={derived.buckets.dueToday} showOwner={showOwner} tone="var(--color-gold)" />
            <Section title="Upcoming" items={derived.buckets.upcoming} showOwner={showOwner} tone="var(--color-text-muted)" />
            {derived.counts.overdue + derived.counts.dueToday + derived.counts.upcoming === 0 && (
              <p className="muted">No follow-ups scheduled.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className="value" style={{ color: value > 0 ? tone : undefined }}>{value}</span>
    </div>
  );
}
