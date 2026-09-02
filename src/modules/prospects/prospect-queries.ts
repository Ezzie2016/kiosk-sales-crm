import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { prospectRepository, type ProspectFilters } from './prospect-repository';
import type { PipelineStatus } from '@/constants/pipeline';

const keys = {
  all: ['prospects'] as const,
  list: (f: ProspectFilters) => ['prospects', 'list', f] as const,
  detail: (id: string) => ['prospects', 'detail', id] as const,
  activities: (id: string) => ['prospects', id, 'activities'] as const,
  history: (id: string) => ['prospects', id, 'history'] as const,
  payments: (id: string) => ['prospects', id, 'payments'] as const,
  staff: ['staff', 'list'] as const,
};

export function useProspects(filters: ProspectFilters) {
  return useQuery({ queryKey: keys.list(filters), queryFn: () => prospectRepository.list(filters) });
}

export function useProspect(id: string) {
  return useQuery({ queryKey: keys.detail(id), queryFn: () => prospectRepository.get(id), enabled: Boolean(id) });
}

export function useProspectActivities(id: string) {
  return useQuery({ queryKey: keys.activities(id), queryFn: () => prospectRepository.activities(id), enabled: Boolean(id) });
}

export function useProspectStatusHistory(id: string) {
  return useQuery({ queryKey: keys.history(id), queryFn: () => prospectRepository.statusHistory(id), enabled: Boolean(id) });
}

export function useProspectPayments(id: string) {
  return useQuery({ queryKey: keys.payments(id), queryFn: () => prospectRepository.payments(id), enabled: Boolean(id) });
}

export function useStaffList(activeOnly = true) {
  return useQuery({ queryKey: [...keys.staff, activeOnly], queryFn: () => prospectRepository.listStaff(activeOnly) });
}

export function useProspectMutations(id?: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: keys.all });
    void qc.invalidateQueries({ queryKey: ['followups'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['analytics'] });
    if (id) {
      void qc.invalidateQueries({ queryKey: keys.detail(id) });
      void qc.invalidateQueries({ queryKey: keys.activities(id) });
      void qc.invalidateQueries({ queryKey: keys.history(id) });
    }
  };

  return {
    changeStatus: useMutation({
      mutationFn: (vars: { id: string; to: PipelineStatus; reason?: string; lostReason?: string }) =>
        prospectRepository.changeStatus(vars.id, vars.to, vars.reason, vars.lostReason),
      onSuccess: invalidate,
    }),
    assign: useMutation({
      mutationFn: (vars: { id: string; salespersonId: string | null; reason?: string }) =>
        prospectRepository.assign(vars.id, vars.salespersonId, vars.reason),
      onSuccess: invalidate,
    }),
    logActivity: useMutation({
      mutationFn: (vars: { id: string; type: string; description?: string }) =>
        prospectRepository.logActivity(vars.id, vars.type, vars.description),
      onSuccess: invalidate,
    }),
    addNote: useMutation({
      mutationFn: (vars: { id: string; note: string }) => prospectRepository.addNote(vars.id, vars.note),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (vars: { id: string; patch: Record<string, unknown> }) =>
        prospectRepository.update(vars.id, vars.patch),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (vars: { id: string }) => prospectRepository.remove(vars.id),
      onSuccess: invalidate,
    }),
  };
}
