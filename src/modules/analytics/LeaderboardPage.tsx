import { useLeaderboard } from './analytics-queries';
import { findMyRow, totalConfirmedRevenueKobo } from './leaderboard';
import { formatRate } from './funnel-metrics';
import { Currency } from '@/components/Currency';
import { useAuth } from '@/modules/auth/use-auth';

/**
 * Salesperson leaderboard (spec §8) — ranked by retained paying merchants, then
 * revenue. Every rep sees the same board (name / paid / revenue); the current
 * user's row is highlighted so they can see their position.
 */
export function LeaderboardPage() {
  const { staff } = useAuth();
  const { ranked, data, isLoading, error } = useLeaderboard();
  const myRow = ranked && staff ? findMyRow(ranked, staff.id) : null;

  return (
    <div className="content">
      <div className="page-head">
        <h1>Leaderboard</h1>
        <span className="muted" style={{ fontSize: '0.85rem' }}>Ranked by paying merchants acquired, then revenue.</span>
      </div>

      {error && <div className="warn">{(error as Error).message}</div>}
      {isLoading && <p className="muted">Loading…</p>}

      {myRow && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="grid cols-auto">
            <div className="stat"><span className="label">Your rank</span><span className="value">#{myRow.rank}</span></div>
            <div className="stat"><span className="label">Paying merchants</span><span className="value">{myRow.paidCount}</span></div>
            <div className="stat">
              <span className="label">Revenue</span>
              <span className="value"><Currency amountKobo={myRow.confirmedRevenueKobo} /></span>
            </div>
            <div className="stat"><span className="label">Your conversion</span><span className="value">{formatRate(myRow.conversionRate)}</span></div>
          </div>
        </div>
      )}

      {ranked && ranked.length > 0 && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="list">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Salesperson</th>
                <th>Paid</th>
                <th>Revenue</th>
                <th>Assigned</th>
                <th>Conversion</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((row) => {
                const isMe = staff?.id === row.salespersonId;
                return (
                  <tr key={row.salespersonId} style={isMe ? { background: 'var(--color-surface-hover)', fontWeight: 600 } : undefined}>
                    <td data-label="Rank"><span className="num">#{row.rank}</span></td>
                    <td data-label="Salesperson">
                      {row.fullName}
                      {isMe && <span className="muted"> · you</span>}
                      {!row.isActive && <span className="muted"> · inactive</span>}
                    </td>
                    <td data-label="Paid"><span className="num">{row.paidCount}</span></td>
                    <td data-label="Revenue"><Currency amountKobo={row.confirmedRevenueKobo} /></td>
                    <td data-label="Assigned"><span className="num">{row.assignedCount}</span></td>
                    <td data-label="Conversion"><span className="num">{formatRate(row.conversionRate)}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {ranked && ranked.length === 0 && !isLoading && (
        <div className="card"><p className="muted">No salespeople with activity yet.</p></div>
      )}

      {data && data.length > 0 && (
        <p className="muted" style={{ fontSize: '0.85rem', marginTop: 12 }}>
          Total confirmed revenue: <Currency amountKobo={totalConfirmedRevenueKobo(data)} />
        </p>
      )}
    </div>
  );
}
