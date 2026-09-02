import { useQuery } from '@tanstack/react-query';
import { auditRepository, type AuditFilters } from './audit-repository';

export function useAuditLog(filters: AuditFilters) {
  return useQuery({
    queryKey: ['audit', 'list', filters],
    queryFn: () => auditRepository.list(filters),
  });
}

export function useAuditActions() {
  return useQuery({
    queryKey: ['audit', 'actions'],
    queryFn: () => auditRepository.actions(),
    staleTime: 5 * 60_000,
  });
}
