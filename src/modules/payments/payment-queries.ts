import { useMutation, useQueryClient } from '@tanstack/react-query';
import { paymentRepository } from './payment-repository';
import type { PaymentStatus } from '@/constants/payments';

/** Mutations for recording / updating a payment on a prospect (admin only). */
export function usePaymentMutations(prospectId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['prospects', prospectId, 'payments'] });
    void qc.invalidateQueries({ queryKey: ['prospects', 'detail', prospectId] });
    void qc.invalidateQueries({ queryKey: ['prospects', prospectId, 'activities'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['analytics'] });
  };

  return {
    create: useMutation({
      mutationFn: (row: Record<string, unknown>) => paymentRepository.create(row),
      onSuccess: invalidate,
    }),
    updateStatus: useMutation({
      mutationFn: (vars: { id: string; status: PaymentStatus }) =>
        paymentRepository.updateStatus(vars.id, vars.status),
      onSuccess: invalidate,
    }),
  };
}
