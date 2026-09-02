import { useFunnel } from './analytics-queries';
import { formatRate, type Ratio } from './funnel-metrics';

/**
 * Conversion funnel (spec §9). Shows the stage counts and each transition's
 * rate with its explicit numerator / denominator. RLS-scoped: whole team for an
 * admin, own prospects for a salesperson.
 */
export function FunnelPanel({ scopeLabel }: { scopeLabel: string }) {
  const { derived, isLoading, error } = useFunnel();

  return (
    <div className="card">
      <div className="spread" style={{ marginBottom: 12 }}>
        <h3>Funnel</h3>
        <span className="muted" style={{ fontSize: '0.82rem' }}>{scopeLabel}</span>
      </div>

      {error && <div className="warn">{(error as Error).message}</div>}
      {isLoading && <p className="muted">Loading…</p>}

      {derived && (
        <>
          <div className="grid cols-auto" style={{ marginBottom: 16 }}>
            <Stage label="Total" value={derived.counts.total} />
            <Stage label="Contacted" value={derived.counts.contacted} />
            <Stage label="Replied" value={derived.counts.replied} />
            <Stage label="Demo" value={derived.counts.demo} />
            <Stage label="Trial" value={derived.counts.trial} />
            <Stage label="Paid" value={derived.counts.paid} />
          </div>

          <div className="stack" style={{ gap: 6 }}>
            <ConversionRow label="Contact → Reply" r={derived.conversions.contactToReply} />
            <ConversionRow label="Reply → Demo" r={derived.conversions.replyToDemo} />
            <ConversionRow label="Demo → Trial" r={derived.conversions.demoToTrial} />
            <ConversionRow label="Trial → Paid" r={derived.conversions.trialToPaid} />
            <ConversionRow label="Prospect → Paid (overall)" r={derived.conversions.overallProspectToPaid} strong />
          </div>
        </>
      )}
    </div>
  );
}

function Stage({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}

function ConversionRow({ label, r, strong }: { label: string; r: Ratio; strong?: boolean }) {
  return (
    <div className="spread" style={{ fontWeight: strong ? 600 : 400 }}>
      <span className={strong ? undefined : 'muted'}>{label}</span>
      <span>
        <span className="num">{formatRate(r)}</span>{' '}
        <span className="muted" style={{ fontSize: '0.82rem' }}>
          (<span className="num">{r.numerator}</span> / <span className="num">{r.denominator}</span>)
        </span>
      </span>
    </div>
  );
}
