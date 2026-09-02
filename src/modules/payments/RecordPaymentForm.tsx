import { useState, type FormEvent } from 'react';
import { paymentCreateSchema } from './payment-schemas';
import { buildPaymentRow } from './payment-service';
import { usePaymentMutations } from './payment-queries';
import { useStaffList } from '@/modules/prospects/prospect-queries';
import { PAYMENT_STATUSES, PAYMENT_STATUS_LABEL } from '@/constants/payments';
import { useAuth } from '@/modules/auth/use-auth';

/**
 * Admin-only "record a payment" form (spec §10). Manual entry for V1; the shape
 * matches a future automated Kiosk payment event. Recording a payment does not
 * move the pipeline status — that is deliberate and called out below.
 */
export function RecordPaymentForm({
  prospectId,
  prospectOwnerId,
}: {
  prospectId: string;
  prospectOwnerId: string | null;
}) {
  const { staff } = useAuth();
  const { data: staffList } = useStaffList();
  const { create } = usePaymentMutations(prospectId);

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<Record<string, string>>({
    plan: '',
    amountNaira: '',
    paidOn: today,
    status: 'pending',
    attributedSalespersonId: prospectOwnerId ?? '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const parsed = paymentCreateSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        errs[key] ??= issue.message;
      }
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});

    let row: Record<string, unknown>;
    try {
      row = buildPaymentRow(parsed.data, prospectId, staff!.id, prospectOwnerId).row;
    } catch (err) {
      setSubmitError((err as Error).message);
      return;
    }
    create.mutate(row, {
      onSuccess: () => setForm((f) => ({ ...f, plan: '', amountNaira: '', status: 'pending' })),
      onError: (err) => setSubmitError((err as Error).message),
    });
  }

  return (
    <form onSubmit={onSubmit} className="stack" style={{ gap: 8 }}>
      <div className="row">
        <div className="field" style={{ flex: 1, margin: 0 }}>
          <label htmlFor="pay-plan">Plan</label>
          <input id="pay-plan" value={form.plan} onChange={(e) => set('plan', e.target.value)} placeholder="e.g. Growth" />
          {fieldErrors.plan && <span className="warn">{fieldErrors.plan}</span>}
        </div>
        <div className="field" style={{ flex: 1, margin: 0 }}>
          <label htmlFor="pay-amount">Amount (₦)</label>
          <input id="pay-amount" inputMode="decimal" value={form.amountNaira}
            onChange={(e) => set('amountNaira', e.target.value)} placeholder="15000" />
          {fieldErrors.amountNaira && <span className="warn">{fieldErrors.amountNaira}</span>}
        </div>
      </div>

      <div className="row">
        <div className="field" style={{ flex: 1, margin: 0 }}>
          <label htmlFor="pay-date">Payment date</label>
          <input id="pay-date" type="date" value={form.paidOn} onChange={(e) => set('paidOn', e.target.value)} />
          {fieldErrors.paidOn && <span className="warn">{fieldErrors.paidOn}</span>}
        </div>
        <div className="field" style={{ flex: 1, margin: 0 }}>
          <label htmlFor="pay-status">Status</label>
          <select id="pay-status" value={form.status} onChange={(e) => set('status', e.target.value)}>
            {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{PAYMENT_STATUS_LABEL[s]}</option>)}
          </select>
        </div>
      </div>

      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="pay-attrib">Attributed to</label>
        <select id="pay-attrib" value={form.attributedSalespersonId}
          onChange={(e) => set('attributedSalespersonId', e.target.value)}>
          <option value="">Unassigned</option>
          {(staffList ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
        </select>
      </div>

      <p className="muted" style={{ fontSize: '0.8rem', margin: 0 }}>
        Recording a payment does not change the pipeline status — move the prospect to Paid separately.
      </p>

      {submitError && <div className="warn">{submitError}</div>}

      <div className="row">
        <button className="btn primary" type="submit" disabled={create.isPending}>
          {create.isPending ? 'Recording…' : 'Record payment'}
        </button>
      </div>
    </form>
  );
}
