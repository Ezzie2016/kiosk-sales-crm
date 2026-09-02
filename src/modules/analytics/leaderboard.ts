/**
 * Salesperson leaderboard (spec §8, §26).
 *
 * The north-star metric is retained paying merchants acquired per salesperson, so
 * the ranking is by paid count first, then confirmed revenue, then name. Ranking
 * is "standard competition" (1, 2, 2, 4) — ties share a rank and the next rank
 * skips.
 *
 * Only the aggregate {name, paid, revenue, assigned} is ever shown — no
 * prospect-level data about other salespeople (spec §8: "Do not expose
 * unnecessary private data").
 *
 * Pure. Input rows come from the `crm.leaderboard()` RPC (a SECURITY DEFINER
 * aggregate), so a salesperson can see the ranked table without read access to
 * anyone else's prospects.
 */
import { ratio, type Ratio } from './funnel-metrics';

export interface LeaderboardRow {
  salespersonId: string;
  fullName: string;
  isActive: boolean;
  assignedCount: number;
  /** Prospects attributed to this rep that have ever converted (`paid_at` set). */
  paidCount: number;
  confirmedRevenueKobo: number;
}

export interface RankedLeaderboardRow extends LeaderboardRow {
  rank: number;
  /** paidCount / assignedCount — the rep's own prospect→paid conversion. */
  conversionRate: Ratio;
}

function compareRows(a: LeaderboardRow, b: LeaderboardRow): number {
  if (a.paidCount !== b.paidCount) return b.paidCount - a.paidCount;
  if (a.confirmedRevenueKobo !== b.confirmedRevenueKobo) return b.confirmedRevenueKobo - a.confirmedRevenueKobo;
  return a.fullName.localeCompare(b.fullName);
}

/** Two rows tie iff their ranking keys (paid, then revenue) are equal. */
function tiesWith(a: LeaderboardRow, b: LeaderboardRow): boolean {
  return a.paidCount === b.paidCount && a.confirmedRevenueKobo === b.confirmedRevenueKobo;
}

export function rankLeaderboard(rows: readonly LeaderboardRow[]): RankedLeaderboardRow[] {
  const sorted = [...rows].sort(compareRows);
  const out: RankedLeaderboardRow[] = [];
  sorted.forEach((row, index) => {
    const prev = index > 0 ? sorted[index - 1] : undefined;
    const rank = prev && tiesWith(prev, row) ? out[index - 1]!.rank : index + 1;
    out.push({ ...row, rank, conversionRate: ratio(row.paidCount, row.assignedCount) });
  });
  return out;
}

/** The current user's row + position, or null if they are not on the board. */
export function findMyRow(ranked: readonly RankedLeaderboardRow[], salespersonId: string): RankedLeaderboardRow | null {
  return ranked.find((r) => r.salespersonId === salespersonId) ?? null;
}

export function totalConfirmedRevenueKobo(rows: readonly LeaderboardRow[]): number {
  return rows.reduce((sum, r) => sum + r.confirmedRevenueKobo, 0);
}
