import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsRepository } from './analytics-repository';
import { computeConversions, computeFunnelCounts } from './funnel-metrics';
import { rankLeaderboard } from './leaderboard';

/** RLS-scoped funnel: whole team for an admin, own prospects for a salesperson. */
export function useFunnel() {
  const query = useQuery({
    queryKey: ['analytics', 'funnel'],
    queryFn: () => analyticsRepository.getFunnelData(),
  });
  const derived = useMemo(() => {
    if (!query.data) return null;
    const counts = computeFunnelCounts(query.data);
    return { counts, conversions: computeConversions(counts) };
  }, [query.data]);
  return { ...query, derived };
}

export function useLeaderboard() {
  const query = useQuery({
    queryKey: ['analytics', 'leaderboard'],
    queryFn: () => analyticsRepository.getLeaderboard(),
  });
  const ranked = useMemo(() => (query.data ? rankLeaderboard(query.data) : null), [query.data]);
  return { ...query, ranked };
}
