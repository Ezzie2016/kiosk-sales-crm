import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  useProspect,
  useProspectActivities,
  useProspectPayments,
  useProspectMutations,
} from './prospect-queries';
import { StatusControl } from './StatusControl';
import { AssignControl } from './AssignControl';
import { LogActivityControl } from './LogActivityControl';
import { ActivityTimeline } from '@/modules/activities/ActivityTimeline';
import { RecordPaymentForm } from '@/modules/payments/RecordPaymentForm';
import { PaymentStatusControl } from '@/modules/payments/PaymentStatusControl';
import { PipelineBar } from '@/components/PipelineBar';
import { StampBadge } from '@/components/StampBadge';
import { Currency } from '@/components/Currency';
import { useAuth } from '@/modules/auth/use-auth';
import {
  canAssignProspect,
  canDeleteProspect,
  canEditProspect,
  canManagePayments,
  canRecordActivity,
  canViewProspect,
} from '@/modules/authorization/permissions';
import { BUSINESS_CATEGORY_LABEL } from '@/constants/categories';
import { PROSPECT_SOURCE_LABEL } from '@/constants/sources';
import { formatDate, formatDateTime, relativeDay } from '@/lib/format';
import { isRevenueCounting, PAYMENT_STATUS_LABEL } from '@/constants/payments';

export function ProspectDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { actor } = useAuth();
  const { data: prospect, isLoading, error } = useProspect(id);
  const { data: activities } = useProspectActivities(id);
  const { data: payments } = useProspectPayments(id);
  const { addNote, remove } = useProspectMutations(id);
  const [note, setNote] = useState('');

  if (isLoading) return <div className="content"><p className="muted">Loading…</p></div>;
  if (error) return <div className="content"><div className="warn">{(error as Error).message}</div></div>;
  if (!prospect) return <div className="content"><div className="card"><h2>Not found</h2><p className="muted">This prospect does not exist or you do not have access.</p></div></div>;

  const prospectRef = { assignedSalespersonId: prospect.assigned_salesperson_id, status: prospect.status };
  if (actor && !canViewProspect(actor, prospectRef)) {
    return <div className="content"><div className="card"><h2>Not authorized</h2></div></div>;
  }

  const mayRecord = actor ? canRecordActivity(actor, prospectRef) : false;
  const mayEdit = actor ? canEditProspect(actor, prospectRef) : false;
  const mayAssign = actor ? canAssignProspect(actor) : false;
  const mayDelete = actor ? canDeleteProspect(actor) : false;
  const mayManagePayments = actor ? canManagePayments(actor) : false;
  const confirmedRevenue = (payments ?? [])
    .filter((p) => isRevenueCounting(p.status))
    .reduce((sum, p) => sum + p.amount_kobo, 0);

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1 style={{ marginBottom: 4 }}>{prospect.business_name}</h1>
          <div className="row">
            <StampBadge status={prospect.status} />
            <span className="muted">
              {prospect.assigned_salesperson ? `Owned by ${prospect.assigned_salesperson.full_name}` : 'Unassigned'}
            </span>
          </div>
        </div>
        <div className="row">
          {mayEdit && (
            <Link className="btn" to={`/prospects/${id}/edit`}>
              Edit
            </Link>
          )}
          {mayDelete && (
            <button
              className="btn danger"
              onClick={() => {
                if (window.confirm('Delete this prospect? This is an admin-only, audited action.')) {
                  remove.mutate({ id }, { onSuccess: () => navigate('/prospects') });
                }
              }}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12 }}>Pipeline</h3>
        <PipelineBar status={prospect.status} />
        {mayRecord && <div style={{ marginTop: 16 }}><StatusControl prospectId={id} current={prospect.status} /></div>}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', marginBottom: 16 }}>
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>Contact</h3>
          <dl className="stack" style={{ margin: 0 }}>
            <Row label="Contact name" value={prospect.contact_name} />
            <Row label="Phone" value={prospect.phone} />
            <Row label="WhatsApp" value={prospect.whatsapp_number} />
            <Row label="Instagram" value={prospect.instagram_handle} />
            <Row label="Email" value={prospect.email} />
            <Row label="Website" value={prospect.website} />
            <Row label="Location" value={prospect.location} />
            <Row label="Category" value={BUSINESS_CATEGORY_LABEL[prospect.business_category]} />
            <Row label="Source" value={PROSPECT_SOURCE_LABEL[prospect.source]} />
          </dl>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 12 }}>Follow-up</h3>
          <Row label="Next follow-up" value={prospect.next_follow_up_at ? `${formatDateTime(prospect.next_follow_up_at)} (${relativeDay(prospect.next_follow_up_at)})` : null} />
          <Row label="Follow-up note" value={prospect.follow_up_note} />
          <Row label="Last contacted" value={prospect.last_contacted_at ? formatDateTime(prospect.last_contacted_at) : null} />
          <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '12px 0' }} />
          <h3 style={{ marginBottom: 12 }}>Commercial</h3>
          <Row label="Trial started" value={prospect.trial_started_at ? formatDate(prospect.trial_started_at) : null} />
          <Row label="Converted (paid)" value={prospect.paid_at ? formatDate(prospect.paid_at) : null} />
          <Row label="Linked merchant id" value={prospect.converted_merchant_id} />
          <div className="spread" style={{ marginTop: 8 }}>
            <span className="muted">Confirmed revenue</span>
            <Currency amountKobo={confirmedRevenue} />
          </div>

          {(payments ?? []).length === 0 && <p className="muted" style={{ fontSize: '0.85rem' }}>No payments recorded.</p>}
          {(payments ?? []).map((p) => (
            <div key={p.id} className="spread" style={{ fontSize: '0.85rem', marginTop: 4 }}>
              <span className="muted">{p.plan} · {formatDate(p.paid_on)}</span>
              <span className="row" style={{ gap: 8 }}>
                <Currency amountKobo={p.amount_kobo} />
                {mayManagePayments ? (
                  <PaymentStatusControl prospectId={id} paymentId={p.id} status={p.status} />
                ) : (
                  <span className="muted">{PAYMENT_STATUS_LABEL[p.status]}</span>
                )}
              </span>
            </div>
          ))}

          {mayManagePayments && (
            <>
              <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '12px 0' }} />
              <h4 style={{ marginBottom: 8, fontSize: '0.9rem' }}>Record a payment</h4>
              <RecordPaymentForm prospectId={id} prospectOwnerId={prospect.assigned_salesperson_id} />
            </>
          )}
        </div>
      </div>

      {mayAssign && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Assignment (admin)</h3>
          <AssignControl prospectId={id} currentSalespersonId={prospect.assigned_salesperson_id} isPaid={prospect.status === 'paid'} />
        </div>
      )}

      {prospect.notes && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Notes</h3>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{prospect.notes}</p>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Activity</h3>
        {mayRecord && (
          <div className="stack" style={{ marginBottom: 16 }}>
            <LogActivityControl prospectId={id} />
            <div className="row">
              <input placeholder="Add an internal note…" value={note} onChange={(e) => setNote(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-background)', color: 'inherit' }} />
              <button className="btn" disabled={addNote.isPending || note.trim().length === 0}
                onClick={() => addNote.mutate({ id, note }, { onSuccess: () => setNote('') })}>
                Add note
              </button>
            </div>
          </div>
        )}
        <ActivityTimeline activities={activities ?? []} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="spread">
      <span className="muted">{label}</span>
      <span>{value && value.length > 0 ? value : '—'}</span>
    </div>
  );
}
