import { describe, expect, it } from 'vitest';
import {
  computeConfirmedRevenueKobo,
  computeOverviewTotals,
  computePipelineCounts,
  computeTodayCounts,
} from './dashboard-metrics';
import type { PipelineStatus } from '@/constants/pipeline';

describe('computePipelineCounts', () => {
  it('counts each stage and zero-fills the rest', () => {
    const statuses: PipelineStatus[] = ['new', 'new', 'contacted', 'paid', 'lost', 'lost', 'lost'];
    expect(computePipelineCounts(statuses)).toEqual({
      new: 2,
      contacted: 1,
      replied: 0,
      demo: 0,
      trial: 0,
      paid: 1,
      lost: 3,
    });
  });

  it('returns an all-zero map for no prospects', () => {
    expect(computePipelineCounts([])).toEqual({
      new: 0,
      contacted: 0,
      replied: 0,
      demo: 0,
      trial: 0,
      paid: 0,
      lost: 0,
    });
  });
});

describe('computeConfirmedRevenueKobo (spec §23 — revenue is correct)', () => {
  it('sums only confirmed payments', () => {
    const total = computeConfirmedRevenueKobo([
      { status: 'confirmed', amountKobo: 465_000_00 },
      { status: 'confirmed', amountKobo: 360_000_00 },
      { status: 'pending', amountKobo: 999_999_00 },
      { status: 'refunded', amountKobo: 100_000_00 },
      { status: 'failed', amountKobo: 50_000_00 },
    ]);
    expect(total).toBe(825_000_00);
  });

  it('is zero when nothing is confirmed', () => {
    expect(computeConfirmedRevenueKobo([{ status: 'pending', amountKobo: 10_000_00 }])).toBe(0);
  });

  it('uses integer kobo, so no floating-point drift', () => {
    const total = computeConfirmedRevenueKobo(
      Array.from({ length: 3 }, () => ({ status: 'confirmed' as const, amountKobo: 10_00 })),
    );
    expect(total).toBe(30_00);
  });
});

describe('computeTodayCounts (Africa/Lagos day boundary)', () => {
  const now = new Date('2026-08-29T12:00:00Z'); // Lagos 13:00 on 2026-08-29
  const todayLagos = '2026-08-29T08:00:00Z'; // within today
  const lateLastNight = '2026-08-28T22:00:00Z'; // 23:00 Lagos on the 28th — NOT today
  const justAfterLagosMidnight = '2026-08-28T23:30:00Z'; // 00:30 Lagos on the 29th — IS today

  it('counts prospects added today by Lagos day, not UTC day', () => {
    const result = computeTodayCounts({
      prospects: [
        { createdAt: todayLagos, trialStartedAt: null, paidAt: null },
        { createdAt: justAfterLagosMidnight, trialStartedAt: null, paidAt: null },
        { createdAt: lateLastNight, trialStartedAt: null, paidAt: null },
      ],
      activities: [],
    }, now);
    expect(result.prospectsAdded).toBe(2);
  });

  it('counts distinct contacted prospects, replies, demos, trials and conversions', () => {
    const result = computeTodayCounts({
      prospects: [
        { createdAt: lateLastNight, trialStartedAt: todayLagos, paidAt: null },
        { createdAt: lateLastNight, trialStartedAt: null, paidAt: todayLagos },
      ],
      activities: [
        { type: 'dm_sent', prospectId: 'a', createdAt: todayLagos },
        { type: 'whatsapp_sent', prospectId: 'a', createdAt: todayLagos }, // same prospect, still 1
        { type: 'phone_call', prospectId: 'b', createdAt: todayLagos },
        { type: 'reply_received', prospectId: 'b', createdAt: todayLagos },
        { type: 'demo_completed', prospectId: 'c', createdAt: todayLagos },
        { type: 'dm_sent', prospectId: 'z', createdAt: lateLastNight }, // yesterday — ignored
      ],
    }, now);

    expect(result.prospectsContacted).toBe(2);
    expect(result.repliesReceived).toBe(1);
    expect(result.demosCompleted).toBe(1);
    expect(result.trialsStarted).toBe(1);
    expect(result.merchantsConverted).toBe(1);
  });
});

describe('computeOverviewTotals', () => {
  it('derives totals, active count and revenue together', () => {
    const statuses: PipelineStatus[] = ['new', 'contacted', 'trial', 'paid', 'paid', 'lost'];
    const totals = computeOverviewTotals(statuses, [
      { status: 'confirmed', amountKobo: 465_000_00 },
      { status: 'pending', amountKobo: 15_000_00 },
    ]);
    expect(totals).toEqual({
      totalProspects: 6,
      paying: 2,
      lost: 1,
      active: 3,
      confirmedRevenueKobo: 465_000_00,
    });
  });
});
