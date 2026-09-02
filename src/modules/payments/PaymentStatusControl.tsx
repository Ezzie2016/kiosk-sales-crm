import { usePaymentMutations } from './payment-queries';
import { PAYMENT_STATUSES, PAYMENT_STATUS_LABEL, isPaymentStatus, type PaymentStatus } from '@/constants/payments';

/** Inline status change for one payment (admin only). No delete — refund = status. */
export function PaymentStatusControl({
  prospectId,
  paymentId,
  status,
}: {
  prospectId: string;
  paymentId: string;
  status: PaymentStatus;
}) {
  const { updateStatus } = usePaymentMutations(prospectId);
  return (
    <select
      value={status}
      disabled={updateStatus.isPending}
      onChange={(e) => {
        const next = e.target.value;
        if (isPaymentStatus(next) && next !== status) {
          updateStatus.mutate({ id: paymentId, status: next });
        }
      }}
      aria-label="Payment status"
      style={{ fontSize: '0.82rem', padding: '2px 6px' }}
    >
      {PAYMENT_STATUSES.map((s) => (
        <option key={s} value={s}>{PAYMENT_STATUS_LABEL[s]}</option>
      ))}
    </select>
  );
}
