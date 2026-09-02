import { describe, expect, it } from 'vitest';
import { findMyRow, rankLeaderboard, totalConfirmedRevenueKobo, type LeaderboardRow } from './leaderboard';

const row = (o: Partial<LeaderboardRow> & Pick<LeaderboardRow, 'salespersonId' | 'fullName'>): LeaderboardRow => ({
  isActive: true,
  assignedCount: 0,
  paidCount: 0,
  confirmedRevenueKobo: 0,
  ...o,
});

describe('rankLeaderboard', () => {
  it('ranks by paid count, then revenue, then name (spec §8 example)', () => {
    const ranked = rankLeaderboard([
      row({ salespersonId: 't', fullName: 'Tunde', paidCount: 18, confirmedRevenueKobo: 270_000_00, assignedCount: 90 }),
      row({ salespersonId: 'a', fullName: 'Amaka', paidCount: 31, confirmedRevenueKobo: 465_000_00, assignedCount: 120 }),
      row({ salespersonId: 'd', fullName: 'David', paidCount: 24, confirmedRevenueKobo: 360_000_00, assignedCount: 100 }),
    ]);
    expect(ranked.map((r) => [r.rank, r.fullName, r.paidCount])).toEqual([
      [1, 'Amaka', 31],
      [2, 'David', 24],
      [3, 'Tunde', 18],
    ]);
  });

  it('breaks a paid-count tie by confirmed revenue', () => {
    const ranked = rankLeaderboard([
      row({ salespersonId: 'a', fullName: 'A', paidCount: 10, confirmedRevenueKobo: 100 }),
      row({ salespersonId: 'b', fullName: 'B', paidCount: 10, confirmedRevenueKobo: 500 }),
    ]);
    expect(ranked.map((r) => r.fullName)).toEqual(['B', 'A']);
  });

  it('uses standard competition ranking for a genuine tie (1, 2, 2, 4)', () => {
    const ranked = rankLeaderboard([
      row({ salespersonId: 'a', fullName: 'A', paidCount: 5, confirmedRevenueKobo: 0 }),
      row({ salespersonId: 'b', fullName: 'B', paidCount: 3, confirmedRevenueKobo: 100 }),
      row({ salespersonId: 'c', fullName: 'C', paidCount: 3, confirmedRevenueKobo: 100 }),
      row({ salespersonId: 'd', fullName: 'D', paidCount: 1, confirmedRevenueKobo: 0 }),
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it('attaches each rep\'s own prospect→paid conversion rate', () => {
    const [r] = rankLeaderboard([row({ salespersonId: 'a', fullName: 'A', paidCount: 3, assignedCount: 12 })]);
    expect(r?.conversionRate).toEqual({ numerator: 3, denominator: 12, rate: 0.25 });
  });

  it('handles a rep with zero assigned prospects without dividing by zero', () => {
    const [r] = rankLeaderboard([row({ salespersonId: 'a', fullName: 'A', paidCount: 0, assignedCount: 0 })]);
    expect(r?.conversionRate.rate).toBe(0);
  });

  it('does not mutate the input array', () => {
    const input = [row({ salespersonId: 'b', fullName: 'B', paidCount: 1 }), row({ salespersonId: 'a', fullName: 'A', paidCount: 9 })];
    const snapshot = input.map((r) => r.salespersonId);
    rankLeaderboard(input);
    expect(input.map((r) => r.salespersonId)).toEqual(snapshot);
  });
});

describe('findMyRow', () => {
  const ranked = rankLeaderboard([
    row({ salespersonId: 'a', fullName: 'Amaka', paidCount: 31 }),
    row({ salespersonId: 'd', fullName: 'David', paidCount: 24 }),
  ]);

  it('returns the caller\'s ranked row', () => {
    expect(findMyRow(ranked, 'd')?.rank).toBe(2);
  });

  it('returns null when the caller is not on the board', () => {
    expect(findMyRow(ranked, 'nobody')).toBeNull();
  });
});

describe('totalConfirmedRevenueKobo', () => {
  it('sums revenue across the board', () => {
    expect(
      totalConfirmedRevenueKobo([
        row({ salespersonId: 'a', fullName: 'A', confirmedRevenueKobo: 465_000_00 }),
        row({ salespersonId: 'b', fullName: 'B', confirmedRevenueKobo: 360_000_00 }),
      ]),
    ).toBe(825_000_00);
  });
});
