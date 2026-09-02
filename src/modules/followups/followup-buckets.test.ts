import { describe, expect, it } from 'vitest';
import { bucketFollowUps, followUpCounts, type FollowUpProspect } from './followup-buckets';
import type { PipelineStatus } from '@/constants/pipeline';

const LAGOS = 'Africa/Lagos'; // UTC+1, no DST
const NOW = new Date('2026-08-29T12:00:00Z'); // Lagos 13:00 on 2026-08-29

const p = (
  id: string,
  nextFollowUpAt: string | null,
  status: PipelineStatus = 'contacted',
): FollowUpProspect => ({
  id,
  businessName: `Store ${id}`,
  status,
  nextFollowUpAt,
  followUpNote: null,
  ownerName: null,
});

describe('bucketFollowUps', () => {
  it('splits into overdue / due today / upcoming on the Lagos day boundary', () => {
    const b = bucketFollowUps(
      [
        p('a', '2026-08-27T09:00:00Z'), // overdue
        p('b', '2026-08-28T22:30:00Z'), // 23:30 Lagos on the 28th — still overdue
        p('c', '2026-08-29T06:00:00Z'), // earlier today (Lagos)
        p('d', '2026-08-29T22:00:00Z'), // 23:00 Lagos today
        p('e', '2026-08-30T05:00:00Z'), // upcoming
      ],
      NOW,
      LAGOS,
    );
    expect(b.overdue.map((x) => x.id)).toEqual(['a', 'b']);
    expect(b.dueToday.map((x) => x.id)).toEqual(['c', 'd']);
    expect(b.upcoming.map((x) => x.id)).toEqual(['e']);
  });

  it('treats an instant just after Lagos midnight as today, not overdue', () => {
    const b = bucketFollowUps([p('x', '2026-08-28T23:30:00Z')], NOW, LAGOS); // 00:30 Lagos on the 29th
    expect(b.dueToday.map((x) => x.id)).toEqual(['x']);
    expect(b.overdue).toEqual([]);
  });

  it('ignores prospects with no follow-up date', () => {
    expect(followUpCounts(bucketFollowUps([p('a', null)], NOW, LAGOS))).toEqual({ overdue: 0, dueToday: 0, upcoming: 0 });
  });

  it('drops terminal prospects (paid / lost) even if their follow-up date is set', () => {
    const b = bucketFollowUps(
      [
        p('paid', '2026-08-20T09:00:00Z', 'paid'),
        p('lost', '2026-08-20T09:00:00Z', 'lost'),
        p('live', '2026-08-20T09:00:00Z', 'demo'),
      ],
      NOW,
      LAGOS,
    );
    expect(b.overdue.map((x) => x.id)).toEqual(['live']);
  });

  it('sorts each bucket by date ascending (most urgent first)', () => {
    const b = bucketFollowUps(
      [
        p('late', '2026-08-25T09:00:00Z'),
        p('older', '2026-08-20T09:00:00Z'),
        p('mid', '2026-08-22T09:00:00Z'),
      ],
      NOW,
      LAGOS,
    );
    expect(b.overdue.map((x) => x.id)).toEqual(['older', 'mid', 'late']);
  });

  it('ignores an unparseable date', () => {
    expect(bucketFollowUps([p('bad', 'not-a-date')], NOW, LAGOS)).toEqual({ overdue: [], dueToday: [], upcoming: [] });
  });
});
