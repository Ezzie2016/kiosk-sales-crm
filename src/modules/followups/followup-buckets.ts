/**
 * Follow-up bucketing (spec §6). Splits the prospects that have a
 * `next_follow_up_at` into Overdue / Due today / Upcoming, using the
 * Africa/Lagos day boundary (the whole app's "today" — see lib/time).
 *
 * Terminal prospects (paid / lost) are dropped: a stale follow-up date on a
 * converted or dead prospect is noise, not a task.
 *
 * Pure. Operates on already-fetched, already-authorized rows, so an admin gets
 * the team's follow-ups and a salesperson gets their own.
 */
import { dayRangeInTimeZone, APP_TIME_ZONE } from '@/lib/time';
import { isActiveStatus, type PipelineStatus } from '@/constants/pipeline';

export interface FollowUpProspect {
  id: string;
  businessName: string;
  status: PipelineStatus;
  nextFollowUpAt: string | null;
  followUpNote: string | null;
  ownerName: string | null;
}

export interface FollowUpBuckets {
  overdue: FollowUpProspect[];
  dueToday: FollowUpProspect[];
  upcoming: FollowUpProspect[];
}

export function bucketFollowUps(
  prospects: readonly FollowUpProspect[],
  now: Date = new Date(),
  timeZone: string = APP_TIME_ZONE,
): FollowUpBuckets {
  const { start, end } = dayRangeInTimeZone(now, timeZone);
  const buckets: FollowUpBuckets = { overdue: [], dueToday: [], upcoming: [] };

  for (const p of prospects) {
    if (!p.nextFollowUpAt) continue;
    if (!isActiveStatus(p.status)) continue; // skip paid / lost
    const t = new Date(p.nextFollowUpAt).getTime();
    if (Number.isNaN(t)) continue;

    if (t < start.getTime()) buckets.overdue.push(p);
    else if (t < end.getTime()) buckets.dueToday.push(p);
    else buckets.upcoming.push(p);
  }

  const byDate = (a: FollowUpProspect, b: FollowUpProspect) =>
    new Date(a.nextFollowUpAt as string).getTime() - new Date(b.nextFollowUpAt as string).getTime();
  buckets.overdue.sort(byDate);
  buckets.dueToday.sort(byDate);
  buckets.upcoming.sort(byDate);

  return buckets;
}

export function followUpCounts(buckets: FollowUpBuckets): { overdue: number; dueToday: number; upcoming: number } {
  return {
    overdue: buckets.overdue.length,
    dueToday: buckets.dueToday.length,
    upcoming: buckets.upcoming.length,
  };
}
