import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { staffRepository } from './staff-repository';

export function useStaffOverview() {
  return useQuery({ queryKey: ['staff', 'overview'], queryFn: () => staffRepository.overview() });
}

export function useStaffAdminMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['staff'] });
    void qc.invalidateQueries({ queryKey: ['analytics'] });
  };
  return {
    setActive: useMutation({
      mutationFn: (vars: { id: string; isActive: boolean }) => staffRepository.setActive(vars.id, vars.isActive),
      onSuccess: invalidate,
    }),
    createSalesperson: useMutation({
      mutationFn: (input: { email: string; fullName: string; password: string }) =>
        staffRepository.createSalesperson(input),
      onSuccess: invalidate,
    }),
  };
}
