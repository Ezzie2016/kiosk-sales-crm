/**
 * Funnel / conversion metrics (spec §9).
 *
 * Every ratio is returned as `{ numerator, denominator, rate }` so the UI can
 * show "12 / 87 (13.8%)" — the spec requires the denominator to be explicit and
 * warns against misleading calculations.
 *
 * Definitions
 * -----------
 * A prospect "reached" funnel stage N if the FURTHEST stage it has ever touched
 * (its current status, or any status in its `crm.prospect_status_history`) ranks
 * at or above N. This is monotonic: a prospect now at `demo` counts toward
 * contacted, replied AND demo, even if the status jumped straight there. `lost`
 * is not a funnel stage — a lost prospect counts for the furthest stage it
 * reached before dying.
 *
 * All functions are pure. They operate on already-fetched, already-authorized
 * rows, so an admin gets the whole-team funnel and a salesperson gets their own.
 */
import type { PipelineStatus } from '@/constants/pipeline';

/** Funnel rank. `lost` is excluded (-1); the floor is `new` (0). */
const FUNNEL_RANK: Record<PipelineStatus, number> = {
  new: 0,
  contacted: 1,
  replied: 2,
  demo: 3,
  trial: 4,
  paid: 5,
  lost: -1,
};

const MAX_RANK = FUNNEL_RANK.paid;

export interface ProspectFunnelInput {
  status: PipelineStatus;
  /** Every `to_status` from this prospect's status history (order irrelevant). */
  statusHistory: PipelineStatus[];
}

/** The furthest funnel rank (0..5) a prospect has ever touched. */
export function furthestFunnelStage(input: ProspectFunnelInput): number {
  let max = 0; // floor at `new`
  const consider = (s: PipelineStatus) => {
    if (FUNNEL_RANK[s] > max) max = FUNNEL_RANK[s];
  };
  consider(input.status);
  for (const s of input.statusHistory) consider(s);
  return max;
}

export interface FunnelCounts {
  total: number;
  contacted: number; // reached rank >= 1
  replied: number; // >= 2
  demo: number; // >= 3
  trial: number; // >= 4
  paid: number; // >= 5
  lost: number; // current status === 'lost'
}

export function computeFunnelCounts(prospects: readonly ProspectFunnelInput[]): FunnelCounts {
  const counts: FunnelCounts = { total: 0, contacted: 0, replied: 0, demo: 0, trial: 0, paid: 0, lost: 0 };
  for (const p of prospects) {
    counts.total += 1;
    if (p.status === 'lost') counts.lost += 1;
    const reached = furthestFunnelStage(p);
    if (reached >= 1) counts.contacted += 1;
    if (reached >= 2) counts.replied += 1;
    if (reached >= 3) counts.demo += 1;
    if (reached >= 4) counts.trial += 1;
    if (reached >= MAX_RANK) counts.paid += 1;
  }
  return counts;
}

export interface Ratio {
  numerator: number;
  denominator: number;
  /** numerator / denominator in [0, 1]; 0 when the denominator is 0. */
  rate: number;
}

export function ratio(numerator: number, denominator: number): Ratio {
  return { numerator, denominator, rate: denominator > 0 ? numerator / denominator : 0 };
}

export interface Conversions {
  /** replied / contacted */
  contactToReply: Ratio;
  /** demo / replied */
  replyToDemo: Ratio;
  /** trial / demo */
  demoToTrial: Ratio;
  /** paid / trial */
  trialToPaid: Ratio;
  /** paid / total prospects */
  overallProspectToPaid: Ratio;
}

export function computeConversions(counts: FunnelCounts): Conversions {
  return {
    contactToReply: ratio(counts.replied, counts.contacted),
    replyToDemo: ratio(counts.demo, counts.replied),
    demoToTrial: ratio(counts.trial, counts.demo),
    trialToPaid: ratio(counts.paid, counts.trial),
    overallProspectToPaid: ratio(counts.paid, counts.total),
  };
}

export function formatRate(r: Ratio): string {
  return `${(r.rate * 100).toFixed(1)}%`;
}
