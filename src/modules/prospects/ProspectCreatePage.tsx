import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { prospectCreateSchema, type ProspectCreateInput } from './prospect-schemas';
import { buildCreatePayload, evaluateDuplicates, type DuplicateEvaluation } from './prospect-service';
import { prospectRepository } from './prospect-repository';
import { PROSPECT_SOURCES, PROSPECT_SOURCE_LABEL } from '@/constants/sources';
import { BUSINESS_CATEGORIES, BUSINESS_CATEGORY_LABEL } from '@/constants/categories';
import { useAuth } from '@/modules/auth/use-auth';

const EMPTY = {
  businessName: '', contactName: '', phone: '', whatsappNumber: '', email: '',
  instagramHandle: '', website: '', location: '', notes: '',
  businessCategory: 'provision_store', source: 'instagram',
};

export function ProspectCreatePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { actor } = useAuth();
  const isAdmin = actor?.role === 'admin';

  const [form, setForm] = useState<Record<string, string>>({ ...EMPTY });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [dupEval, setDupEval] = useState<DuplicateEvaluation | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const update = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDupEval(null); // any identifier change invalidates the previous check
  };

  function parse(): ProspectCreateInput | null {
    const result = prospectCreateSchema.safeParse(form);
    if (result.success) {
      setFieldErrors({});
      return result.data;
    }
    const errs: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = String(issue.path[0] ?? 'form');
      errs[path] ??= issue.message;
    }
    setFieldErrors(errs);
    return null;
  }

  async function runDuplicateCheck() {
    const input = parse();
    if (!input) return;
    setChecking(true);
    try {
      const evaluation = await evaluateDuplicates(input, (raw) => prospectRepository.findDuplicateCandidates(raw),
      );
      setDupEval(evaluation);
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const input = parse();
    if (!input) return;

    // Always evaluate duplicates right before submit so nothing slips through.
    let evaluation = dupEval;
    if (!evaluation) {
      setChecking(true);
      try {
        evaluation = await evaluateDuplicates(input, (raw) => prospectRepository.findDuplicateCandidates(raw),
        );
        setDupEval(evaluation);
      } catch (err) {
        setChecking(false);
        setSubmitError((err as Error).message);
        return;
      }
      setChecking(false);
    }

    if (evaluation.blocked && !isAdmin) {
      setSubmitError('A matching prospect already exists. An admin must override to create this.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = buildCreatePayload(input);
      const created = await prospectRepository.create(payload, evaluation.blocked && isAdmin);
      void qc.invalidateQueries({ queryKey: ['prospects'] });
      navigate(`/prospects/${created.id}`);
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="content" style={{ maxWidth: 640 }}>
      <div className="page-head"><h1>New prospect</h1></div>

      <form className="card" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="businessName">Business name *</label>
          <input id="businessName" value={form.businessName} onChange={(e) => update('businessName', e.target.value)}
            onBlur={runDuplicateCheck} required />
          {fieldErrors.businessName && <span className="warn">{fieldErrors.businessName}</span>}
        </div>

        <div className="field">
          <label htmlFor="contactName">Contact name</label>
          <input id="contactName" value={form.contactName} onChange={(e) => update('contactName', e.target.value)} />
        </div>

        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="phone">Phone</label>
            <input id="phone" value={form.phone} onChange={(e) => update('phone', e.target.value)} onBlur={runDuplicateCheck} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="whatsappNumber">WhatsApp</label>
            <input id="whatsappNumber" value={form.whatsappNumber} onChange={(e) => update('whatsappNumber', e.target.value)} onBlur={runDuplicateCheck} />
          </div>
        </div>

        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} onBlur={runDuplicateCheck} />
            {fieldErrors.email && <span className="warn">{fieldErrors.email}</span>}
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="instagramHandle">Instagram</label>
            <input id="instagramHandle" value={form.instagramHandle} onChange={(e) => update('instagramHandle', e.target.value)} onBlur={runDuplicateCheck} placeholder="@handle" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="website">Website</label>
          <input id="website" value={form.website} onChange={(e) => update('website', e.target.value)} onBlur={runDuplicateCheck} />
        </div>
        {fieldErrors.phone && <span className="warn">{fieldErrors.phone}</span>}

        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="businessCategory">Category *</label>
            <select id="businessCategory" value={form.businessCategory} onChange={(e) => update('businessCategory', e.target.value)}>
              {BUSINESS_CATEGORIES.map((c) => <option key={c} value={c}>{BUSINESS_CATEGORY_LABEL[c]}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="source">Source *</label>
            <select id="source" value={form.source} onChange={(e) => update('source', e.target.value)}>
              {PROSPECT_SOURCES.map((s) => <option key={s} value={s}>{PROSPECT_SOURCE_LABEL[s]}</option>)}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="location">Location</label>
          <input id="location" value={form.location} onChange={(e) => update('location', e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" value={form.notes} onChange={(e) => update('notes', e.target.value)} />
        </div>

        {checking && <p className="muted">Checking for duplicates…</p>}

        {dupEval && dupEval.matches.length > 0 && (
          <div className="stack" style={{ marginBottom: 12 }}>
            {dupEval.matches.map((m) => (
              <div key={m.id} className={`warn ${m.strength === 'moderate' ? 'moderate' : ''}`}>
                {m.message}
                {m.strength === 'strong' && (
                  <div className="muted" style={{ marginTop: 4 }}>
                    {isAdmin
                      ? 'You can override this as an admin — submitting will record the override in the audit log.'
                      : 'Ask an admin to create this if it is genuinely a different business.'}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {dupEval && dupEval.matches.length === 0 && !checking && (
          <p className="muted">No duplicates found.</p>
        )}

        {submitError && <div className="warn" style={{ marginBottom: 12 }}>{submitError}</div>}

        <div className="row">
          <button className="btn" type="button" onClick={runDuplicateCheck} disabled={checking}>Check duplicates</button>
          <button className="btn primary" type="submit" disabled={submitting || checking || (dupEval?.blocked && !isAdmin)}>
            {submitting ? 'Creating…' : dupEval?.blocked && isAdmin ? 'Override & create' : 'Create prospect'}
          </button>
        </div>
      </form>
    </div>
  );
}
