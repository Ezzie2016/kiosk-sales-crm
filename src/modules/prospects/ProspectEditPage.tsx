import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useProspect, useProspectMutations } from './prospect-queries';
import { prospectEditSchema } from './prospect-schemas';
import { buildEditPatch } from './prospect-service';
import type { ProspectWithOwner } from '@/types/domain';
import { useAuth } from '@/modules/auth/use-auth';
import { canEditProspect } from '@/modules/authorization/permissions';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/datetime-local';

/**
 * Editable fields (spec §13 Contact / Follow-up / Notes — deliberately NOT
 * status or assignment, which have their own controls on the detail page).
 * Keys match `prospectEditSchema`.
 */
type EditFormState = {
  contactName: string;
  phone: string;
  whatsappNumber: string;
  email: string;
  instagramHandle: string;
  website: string;
  location: string;
  notes: string;
  nextFollowUpAt: string;
  followUpNote: string;
};

function initialFormState(prospect: ProspectWithOwner): EditFormState {
  return {
    contactName: prospect.contact_name ?? '',
    phone: prospect.phone ?? '',
    whatsappNumber: prospect.whatsapp_number ?? '',
    email: prospect.email ?? '',
    instagramHandle: prospect.instagram_handle ?? '',
    website: prospect.website ?? '',
    location: prospect.location ?? '',
    notes: prospect.notes ?? '',
    followUpNote: prospect.follow_up_note ?? '',
    nextFollowUpAt: toDateTimeLocalValue(prospect.next_follow_up_at),
  };
}

export function ProspectEditPage() {
  const { id = '' } = useParams();
  const { actor } = useAuth();
  const { data: prospect, isLoading, error } = useProspect(id);

  if (isLoading) return <div className="content"><p className="muted">Loading…</p></div>;
  if (error) return <div className="content"><div className="warn">{(error as Error).message}</div></div>;
  if (!prospect) {
    return (
      <div className="content">
        <div className="card"><h2>Not found</h2><p className="muted">This prospect does not exist or you do not have access.</p></div>
      </div>
    );
  }

  const prospectRef = { assignedSalespersonId: prospect.assigned_salesperson_id, status: prospect.status };
  if (actor && !canEditProspect(actor, prospectRef)) {
    return (
      <div className="content">
        <div className="card">
          <h2>Not authorized</h2>
          <p className="muted">You can only edit prospects assigned to you.</p>
          <Link className="btn" to={`/prospects/${id}`}>Back to prospect</Link>
        </div>
      </div>
    );
  }

  // Keyed on prospect.id so the form re-initialises if navigation swaps the record.
  return <EditForm key={prospect.id} prospect={prospect} />;
}

function EditForm({ prospect }: { prospect: ProspectWithOwner }) {
  const navigate = useNavigate();
  const { update } = useProspectMutations(prospect.id);
  const [form, setForm] = useState<EditFormState>(() => initialFormState(prospect));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const set = (key: keyof EditFormState, value: string) => setForm((f) => ({ ...f, [key]: value }));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const parsed = prospectEditSchema.safeParse({
      ...form,
      // datetime-local wall-clock → zoned ISO (or undefined when cleared).
      nextFollowUpAt: fromDateTimeLocalValue(form.nextFollowUpAt) ?? undefined,
    });

    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = String(issue.path[0] ?? 'form');
        errs[path] ??= issue.message;
      }
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});

    const patch = buildEditPatch(parsed.data);
    update.mutate(
      { id: prospect.id, patch },
      {
        onSuccess: () => navigate(`/prospects/${prospect.id}`),
        onError: (err) => setSubmitError((err as Error).message),
      },
    );
  }

  return (
    <div className="content" style={{ maxWidth: 640 }}>
      <div className="page-head">
        <h1>Edit {prospect.business_name}</h1>
        <Link className="btn" to={`/prospects/${prospect.id}`}>Cancel</Link>
      </div>

      <form className="card" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="contactName">Contact name</label>
          <input id="contactName" value={form.contactName} onChange={(e) => set('contactName', e.target.value)} />
        </div>

        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="phone">Phone</label>
            <input id="phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="whatsappNumber">WhatsApp</label>
            <input id="whatsappNumber" value={form.whatsappNumber} onChange={(e) => set('whatsappNumber', e.target.value)} />
          </div>
        </div>

        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            {fieldErrors.email && <span className="warn">{fieldErrors.email}</span>}
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="instagramHandle">Instagram</label>
            <input id="instagramHandle" value={form.instagramHandle} onChange={(e) => set('instagramHandle', e.target.value)} placeholder="@handle" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="website">Website</label>
          <input id="website" value={form.website} onChange={(e) => set('website', e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="location">Location</label>
          <input id="location" value={form.location} onChange={(e) => set('location', e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="nextFollowUpAt">Next follow-up</label>
          <input id="nextFollowUpAt" type="datetime-local" value={form.nextFollowUpAt}
            onChange={(e) => set('nextFollowUpAt', e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="followUpNote">Follow-up note</label>
          <textarea id="followUpNote" value={form.followUpNote} onChange={(e) => set('followUpNote', e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </div>

        {submitError && <div className="warn" style={{ marginBottom: 12 }}>{submitError}</div>}

        <div className="row">
          <button className="btn primary" type="submit" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </button>
          <Link className="btn" to={`/prospects/${prospect.id}`}>Cancel</Link>
        </div>
      </form>
    </div>
  );
}
