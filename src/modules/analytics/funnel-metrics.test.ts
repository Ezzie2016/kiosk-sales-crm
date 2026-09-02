import { describe, expect, it } from 'vitest';
import {
  computeConversions,
  computeFunnelCounts,
  formatRate,
  furthestFunnelStage,
  ratio,
  type ProspectFunnelInput,
} from './funnel-metrics';

const p = (status: ProspectFunnelInput['status'], statusHistory: ProspectFunnelInput['statusHistory'] = []): ProspectFunnelInput => ({
  status,
  statusHistory,
});

describe('furthestFunnelStage', () => {
  it('is the current rank for a prospect with no history', () => {
    expect(furthestFunnelStage(p('new'))).toBe(0);
    expect(furthestFunnelStage(p('demo'))).toBe(3);
  });

  it('takes the max over current status and every history entry', () => {
    expect(furthestFunnelStage(p('contacted', ['contacted', 'demo', 'replied']))).toBe(3);
  });

  it('for a lost prospect, reflects the furthest stage reached before it was lost', () => {
    expect(furthestFunnelStage(p('lost', ['contacted', 'replied', 'lost']))).toBe(2);
  });

  it('floors at 0 (new) — a prospect lost with only a lost entry never advanced', () => {
    expect(furthestFunnelStage(p('lost', ['lost']))).toBe(0);
  });
});

describe('computeFunnelCounts', () => {
  it('counts each stage monotonically (a paid prospect counts for every earlier stage)', () => {
    const counts = computeFunnelCounts([
      p('new'),
      p('contacted', ['contacted']),
      p('replied', ['contacted', 'replied']),
      p('demo', ['contacted', 'replied', 'demo']),
      p('trial', ['contacted', 'replied', 'demo', 'trial']),
      p('paid', ['contacted', 'replied', 'demo', 'trial', 'paid']),
    ]);
    expect(counts).toEqual({ total: 6, contacted: 5, replied: 4, demo: 3, trial: 2, paid: 1, lost: 0 });
  });

  it('a status jump still counts the skipped stages (reached demo ⇒ contacted + replied)', () => {
    const counts = computeFunnelCounts([p('demo', ['demo'])]);
    expect(counts).toMatchObject({ contacted: 1, replied: 1, demo: 1, trial: 0, paid: 0 });
  });

  it('counts lost prospects at their furthest stage and in the lost tally', () => {
    const counts = computeFunnelCounts([
      p('lost', ['contacted', 'replied', 'lost']),
      p('lost', ['contacted', 'lost']),
      p('lost', ['lost']),
    ]);
    expect(counts).toEqual({ total: 3, contacted: 2, replied: 1, demo: 0, trial: 0, paid: 0, lost: 3 });
  });

  it('is all-zero for no prospects', () => {
    expect(computeFunnelCounts([])).toEqual({ total: 0, contacted: 0, replied: 0, demo: 0, trial: 0, paid: 0, lost: 0 });
  });
});

describe('ratio', () => {
  it('computes numerator / denominator and keeps both', () => {
    expect(ratio(12, 87)).toEqual({ numerator: 12, denominator: 87, rate: 12 / 87 });
  });

  it('is 0 (not NaN/Infinity) when the denominator is 0', () => {
    expect(ratio(5, 0)).toEqual({ numerator: 5, denominator: 0, rate: 0 });
    expect(ratio(0, 0).rate).toBe(0);
  });
});

describe('computeConversions (spec §9 — each denominator is explicit)', () => {
  it('uses the correct denominator for every step', () => {
    const counts = { total: 100, contacted: 80, replied: 40, demo: 20, trial: 10, paid: 4, lost: 12 };
    const c = computeConversions(counts);
    expect(c.contactToReply).toEqual({ numerator: 40, denominator: 80, rate: 0.5 });
    expect(c.replyToDemo).toEqual({ numerator: 20, denominator: 40, rate: 0.5 });
    expect(c.demoToTrial).toEqual({ numerator: 10, denominator: 20, rate: 0.5 });
    expect(c.trialToPaid).toEqual({ numerator: 4, denominator: 10, rate: 0.4 });
    expect(c.overallProspectToPaid).toEqual({ numerator: 4, denominator: 100, rate: 0.04 });
  });

  it('every step is 0% when there is no data (no divide-by-zero)', () => {
    const c = computeConversions({ total: 0, contacted: 0, replied: 0, demo: 0, trial: 0, paid: 0, lost: 0 });
    for (const step of Object.values(c)) expect(step.rate).toBe(0);
  });

  it('end-to-end from raw prospects', () => {
    const counts = computeFunnelCounts([
      p('paid', ['contacted', 'replied', 'demo', 'trial', 'paid']),
      p('trial', ['contacted', 'replied', 'demo', 'trial']),
      p('replied', ['contacted', 'replied']),
      p('new'),
      p('lost', ['contacted', 'lost']),
    ]);
    // contacted 4, replied 3, demo 2, trial 2, paid 1, total 5
    const c = computeConversions(counts);
    expect(c.contactToReply).toMatchObject({ numerator: 3, denominator: 4 });
    expect(c.trialToPaid).toMatchObject({ numerator: 1, denominator: 2 });
    expect(c.overallProspectToPaid).toMatchObject({ numerator: 1, denominator: 5 });
  });
});

describe('formatRate', () => {
  it('renders one decimal place', () => {
    expect(formatRate(ratio(1, 3))).toBe('33.3%');
    expect(formatRate(ratio(0, 0))).toBe('0.0%');
    expect(formatRate(ratio(1, 1))).toBe('100.0%');
  });
});
