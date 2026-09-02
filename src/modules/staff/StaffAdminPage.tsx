import { useState, type FormEvent } from 'react';
import { useStaffAdminMutations, useStaffOverview } from './staff-queries';
import { suggestPassword, validateNewSalesperson } from './staff-validation';
import { STAFF_ROLE_LABEL } from '@/constants/roles';
import { Currency } from '@/components/Currency';
import type { StaffOverviewRow } from './staff-repository';

/** Admin salesperson management (spec §15). Mounted under <RequireAdmin>. */
export function StaffAdminPage() {
  const { data: rows, isLoading, error } = useStaffOverview();
  const { setActive, createSalesperson } = useStaffAdminMutations();

  return (
    <div className="content">
      <div className="page-head"><h1>Staff</h1></div>

      {error && <div className="warn">{(error as Error).message}</div>}
      {isLoading && <p className="muted">Loading…</p>}

      {rows && (
        <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 16 }}>
          <table className="list">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Assigned</th>
                <th>Active</th>
                <th>Paying</th>
                <th>Revenue</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <StaffRow
                  key={r.id}
                  row={r}
                  pending={setActive.isPending}
                  onToggle={() => {
                    if (
                      r.isActive &&
                      r.activeProspectCount > 0 &&
                      !window.confirm(
                        `${r.fullName} has ${r.activeProspectCount} active prospect(s). ` +
                          `Deactivating keeps all history, but you should reassign those prospects. Continue?`,
                      )
                    ) {
                      return;
                    }
                    setActive.mutate({ id: r.id, isActive: !r.isActive });
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {setActive.isError && <div className="warn">{(setActive.error as Error).message}</div>}

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Add salesperson</h3>
        <AddSalespersonForm
          busy={createSalesperson.isPending}
          error={createSalesperson.isError ? (createSalesperson.error as Error).message : null}
          onSubmit={(v) => createSalesperson.mutate(v)}
        />
      </div>
    </div>
  );
}

function StaffRow({ row, onToggle, pending }: { row: StaffOverviewRow; onToggle: () => void; pending: boolean }) {
  return (
    <tr style={row.isActive ? undefined : { opacity: 0.6 }}>
      <td data-label="Name">{row.fullName}</td>
      <td data-label="Email" style={{ fontSize: '0.85rem' }}>{row.email}</td>
      <td data-label="Role">{STAFF_ROLE_LABEL[row.role]}</td>
      <td data-label="Assigned" className="num">{row.assignedCount}</td>
      <td data-label="Active" className="num">{row.activeProspectCount}</td>
      <td data-label="Paying" className="num">{row.paidCount}</td>
      <td data-label="Revenue"><Currency amountKobo={row.confirmedRevenueKobo} /></td>
      <td data-label="">
        {row.role === 'admin' ? (
          <span className="muted" style={{ fontSize: '0.82rem' }}>—</span>
        ) : (
          <button className="btn" type="button" disabled={pending} onClick={onToggle}>
            {row.isActive ? 'Deactivate' : 'Activate'}
          </button>
        )}
      </td>
    </tr>
  );
}

function AddSalespersonForm({
  onSubmit,
  busy,
  error,
}: {
  onSubmit: (v: { email: string; fullName: string; password: string }) => void;
  busy: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState({ email: '', fullName: '', password: suggestPassword() });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs = validateNewSalesperson(form);
    setErrors(errs);
    if (Object.keys(errs).length === 0) onSubmit({ ...form, email: form.email.trim() });
  }

  return (
    <form onSubmit={submit} className="stack" style={{ gap: 8, maxWidth: 480 }}>
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="s-name">Full name</label>
        <input id="s-name" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
        {errors.fullName && <span className="warn">{errors.fullName}</span>}
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="s-email">Email</label>
        <input id="s-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        {errors.email && <span className="warn">{errors.email}</span>}
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="s-pass">Temporary password</label>
        <div className="row">
          <input id="s-pass" value={form.password} onChange={(e) => set('password', e.target.value)}
            style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-background)', color: 'inherit' }} />
          <button className="btn" type="button" onClick={() => set('password', suggestPassword())}>New</button>
        </div>
        {errors.password && <span className="warn">{errors.password}</span>}
        <span className="muted" style={{ fontSize: '0.8rem' }}>Share this with the salesperson; they can change it after signing in.</span>
      </div>
      {error && <div className="warn">{error}</div>}
      <div className="row">
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create salesperson'}
        </button>
      </div>
    </form>
  );
}
