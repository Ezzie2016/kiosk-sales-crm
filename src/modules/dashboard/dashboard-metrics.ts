/**
 * Basic dashboard metrics (spec §7 / §8, "basic dashboard" scope only).
 *
 * Funnel conversion ratios, leaderboard and revenue-per-rep analytics are
 * deliberately NOT here yet — they are deferred to the post-review phase. What
 * this module computes is limited to counts a human can verify by eye:
 *
 *   - how many prospects sit at each pipeline stage,
 *   - confirmed revenue to date,
 *   - what happened today.
 *
 * All functions are pure and operate on already-fetched, already-authorized
 * rows. Each "today" boundary is Africa/Lagos local (see lib/time).
 */
import { PIPELINE_STATUSES, type PipelineStatus } from '@/constants/pipeline';
import { isRevenueCounting, type PaymentStatus } from '@/constants/payments';
import { dayRangeInTimeZone, APP_TIME_ZONE } from '@/lib/time';

export type PipelineCounts = Record<PipelineStatus, number>;

export function computePipelineCounts(statuses: readonly PipelineStatus[]): PipelineCounts {
  const counts = Object.fromEntries(PIPELINE_STATUSES.map((s) => [s, 0])) as PipelineCounts;
  for (const status of statuses) {
    counts[status] += 1;
  }
  return counts;
}

export interface PaymentRow {
  status: PaymentStatus;
  /** Amount in minor units (kobo). Integer maths only — never a float. */
  amountKobo: number;
}

/**
 * Total revenue = sum of `amountKobo` over payments whose status counts toward
 * revenue (`confirmed` only — see REVENUE_COUNTING_STATUSES). Pending, failed and
 * refunded payments contribute 0, so a refund is modelled by flipping status,
 * not by inserting a negative row (spec §9 — do not double-count).
 */
export function computeConfirmedRevenueKobo(payments: readonly PaymentRow[]): number {
  return payments.reduce((sum, p) => (isRevenueCounting(p.status) ? sum + p.amountKobo : sum), 0);
}

export interface ProspectSnapshot {
  createdAt: string;
  trialStartedAt: string | null;
  paidAt: string | null;
}

export interface ActivitySnapshot {
  type: string;
  prospectId: string;
  createdAt: string;
}

export interface TodayCounts {
  prospectsAdded: number;
  /** Distinct prospects that received at least one outbound contact activity today. */
  prospectsContacted: number;
  repliesReceived: number;
  demosCompleted: number;
  trialsStarted: number;
  merchantsConverted: number;
}

const OUTBOUND_CONTACT_TYPES: ReadonlySet<string> = new Set([
  'dm_sent',
  'whatsapp_sent',
  'phone_call',
  'email_sent',
]);

function inRange(iso: string | null, start: Date, end: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t < end.getTime();
}

export function computeTodayCounts(
  input: { prospects: readonly ProspectSnapshot[]; activities: readonly ActivitySnapshot[] },
  now: Date = new Date(),
  timeZone: string = APP_TIME_ZONE,
): TodayCounts {
  const { start, end } = dayRangeInTimeZone(now, timeZone);

  const prospectsAdded = input.prospects.filter((p) => inRange(p.createdAt, start, end)).length;
  const trialsStarted = input.prospects.filter((p) => inRange(p.trialStartedAt, start, end)).length;
  const merchantsConverted = input.prospects.filter((p) => inRange(p.paidAt, start, end)).length;

  const contactedProspectIds = new Set<string>();
  let repliesReceived = 0;
  let demosCompleted = 0;
  for (const activity of input.activities) {
    if (!inRange(activity.createdAt, start, end)) continue;
    if (OUTBOUND_CONTACT_TYPES.has(activity.type)) contactedProspectIds.add(activity.prospectId);
    if (activity.type === 'reply_received') repliesReceived += 1;
    if (activity.type === 'demo_completed') demosCompleted += 1;
  }

  return {
    prospectsAdded,
    prospectsContacted: contactedProspectIds.size,
    repliesReceived,
    demosCompleted,
    trialsStarted,
    merchantsConverted,
  };
}

export interface OverviewTotals {
  totalProspects: number;
  paying: number;
  lost: number;
  active: number;
  confirmedRevenueKobo: number;
}

export function computeOverviewTotals(
  statuses: readonly PipelineStatus[],
  payments: readonly PaymentRow[],
): OverviewTotals {
  const counts = computePipelineCounts(statuses);
  const active = counts.new + counts.contacted + counts.replied + counts.demo + counts.trial;
  return {
    totalProspects: statuses.length,
    paying: counts.paid,
    lost: counts.lost,
    active,
    confirmedRevenueKobo: computeConfirmedRevenueKobo(payments),
  };
}
