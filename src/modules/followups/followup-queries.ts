import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { followUpRepository } from './followup-repository';
import { bucketFollowUps, followUpCounts } from './followup-buckets';

/** RLS-scoped follow-ups, split into overdue / due today / upcoming (Africa/Lagos). */
export function useFollowUps() {
  const query = useQuery({
    queryKey: ['followups'],
    queryFn: () => followUpRepository.list(),
  });
  const derived = useMemo(() => {
    if (!query.data) return null;
    const buckets = bucketFollowUps(query.data);
    return { buckets, counts: followUpCounts(buckets) };
  }, [query.data]);
  return { ...query, derived };
}
