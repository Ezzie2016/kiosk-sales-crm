/**
 * The prospect pipeline (spec §2).
 *
 *   NEW → CONTACTED → REPLIED → DEMO → TRIAL → PAID → LOST
 *
 * Every prospect has exactly one current status. Status is a stable state
 * machine, so it maps to the `crm.prospect_status` Postgres enum and is NOT a
 * runtime-configurable list. The allowed-transition graph below is enforced in
 * three places that must agree: this constant, the `prospect-service` guard, and
 * the `crm.guard_prospect_status_change` trigger.
 */
export const PIPELINE_STATUSES = [
  'new',
  'contacted',
  'replied',
  'demo',
  'trial',
  'paid',
  'lost',
] as const;

export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

/** The funnel stages in order, excluding the terminal `lost` branch. */
export const FUNNEL_STAGES = [
  'new',
  'contacted',
  'replied',
  'demo',
  'trial',
  'paid',
] as const satisfies readonly PipelineStatus[];

export const PIPELINE_STATUS_LABEL: Record<PipelineStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  replied: 'Replied',
  demo: 'Demo',
  trial: 'Trial',
  paid: 'Paid',
  lost: 'Lost',
};

export function isPipelineStatus(value: unknown): value is PipelineStatus {
  return typeof value === 'string' && (PIPELINE_STATUSES as readonly string[]).includes(value);
}

/**
 * Whether a prospect may move from `from` to `to`.
 *
 * Rules (kept permissive — a human is choosing, and every move is recorded in
 * `crm.prospect_status_history`, so this guards against nonsense, not against
 * legitimate corrections):
 *
 *  - No-op moves (`from === to`) are rejected.
 *  - `lost` is reachable from any state (a prospect can always be marked lost).
 *  - From `lost`, a prospect may be reactivated into any active stage.
 *  - From `paid`, the ONLY exit is `lost` (churn). Moving a converted merchant
 *    back into an earlier funnel stage would corrupt attribution and funnel
 *    metrics, so it is blocked here and in the DB trigger.
 *  - Otherwise any active funnel stage may move to any other active stage
 *    (forward jumps and backward corrections both allowed).
 */
export function canTransition(from: PipelineStatus, to: PipelineStatus): boolean {
  if (from === to) return false;
  if (to === 'lost') return true;
  if (from === 'lost') return true; // reactivation into any active stage (to is already not 'lost')
  if (from === 'paid') return false; // only `paid → lost`, handled above
  return true;
}

export function allowedTransitions(from: PipelineStatus): PipelineStatus[] {
  return PIPELINE_STATUSES.filter((to) => canTransition(from, to));
}

/**
 * Timestamp column that entering a given status must stamp (spec §3). The
 * service and the DB trigger both apply these; they are set once and not
 * cleared on a later backward move, so the historical "first reached trial"
 * moment is preserved.
 */
export const STATUS_ENTRY_TIMESTAMP: Partial<Record<PipelineStatus, 'trial_started_at' | 'paid_at' | 'lost_at'>> = {
  trial: 'trial_started_at',
  paid: 'paid_at',
  lost: 'lost_at',
};

/** Statuses that count as an active (still-workable) prospect. */
export const ACTIVE_STATUSES = ['new', 'contacted', 'replied', 'demo', 'trial'] as const satisfies readonly PipelineStatus[];

export function isActiveStatus(status: PipelineStatus): boolean {
  return (ACTIVE_STATUSES as readonly PipelineStatus[]).includes(status);
}
