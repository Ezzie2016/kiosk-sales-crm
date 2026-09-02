import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useProspects } from './prospect-queries';
import { useStaffList } from './prospect-queries';
import type { ProspectFilters } from './prospect-repository';
import { PIPELINE_STATUSES, PIPELINE_STATUS_LABEL } from '@/constants/pipeline';
import { PROSPECT_SOURCES, PROSPECT_SOURCE_LABEL } from '@/constants/sources';
import { BUSINESS_CATEGORIES, BUSINESS_CATEGORY_LABEL } from '@/constants/categories';
import { StampBadge } from '@/components/StampBadge';
import { ExportProspectsButton } from '@/modules/export/ExportProspectsButton';
import { useAuth } from '@/modules/auth/use-auth';
import { canExportData, canViewAllProspects } from '@/modules/authorization/permissions';
import { formatDate, relativeDay } from '@/lib/format';

export function ProspectListPage() {
  const { actor } = useAuth();
  const [filters, setFilters] = useState<ProspectFilters>({});
  const [searchInput, setSearchInput] = useState('');
  const { data: prospects, isLoading, error } = useProspects(filters);
  const adminView = actor ? canViewAllProspects(actor) : false;
  const mayExport = actor ? canExportData(actor) : false;
  const { data: staff } = useStaffList();

  const set = (patch: Partial<ProspectFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const rows = useMemo(() => prospects ?? [], [prospects]);

  return (
    <div className="content">
      <div className="page-head">
        <h1>Prospects</h1>
        <span className="row" style={{ gap: 8 }}>
          {mayExport && <ExportProspectsButton filters={filters} />}
          <Link className="btn primary" to="/prospects/new">+ New prospect</Link>
        </span>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              set({ search: searchInput });
            }}
            className="row"
            style={{ flex: 1, minWidth: 220 }}
          >
            <input
              placeholder="Search name, phone, email, IG…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-background)', color: 'inherit' }}
            />
            <button className="btn" type="submit">Search</button>
          </form>

          <select value={filters.status ?? ''} onChange={(e) => set({ status: (e.target.value || undefined) as ProspectFilters['status'] })}>
            <option value="">All statuses</option>
            {PIPELINE_STATUSES.map((s) => <option key={s} value={s}>{PIPELINE_STATUS_LABEL[s]}</option>)}
          </select>

          <select value={filters.source ?? ''} onChange={(e) => set({ source: e.target.value || undefined })}>
            <option value="">All sources</option>
            {PROSPECT_SOURCES.map((s) => <option key={s} value={s}>{PROSPECT_SOURCE_LABEL[s]}</option>)}
          </select>

          <select value={filters.category ?? ''} onChange={(e) => set({ category: e.target.value || undefined })}>
            <option value="">All categories</option>
            {BUSINESS_CATEGORIES.map((c) => <option key={c} value={c}>{BUSINESS_CATEGORY_LABEL[c]}</option>)}
          </select>

          {adminView && (
            <select value={filters.salespersonId ?? ''} onChange={(e) => set({ salespersonId: e.target.value || undefined })}>
              <option value="">All salespeople</option>
              {(staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          )}
        </div>
      </div>

      {error && <div className="warn">{(error as Error).message}</div>}
      {isLoading && <p className="muted">Loading prospects…</p>}

      {!isLoading && rows.length === 0 && (
        <div className="card"><p className="muted">No prospects match these filters.</p></div>
      )}

      {rows.length > 0 && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="list">
            <thead>
              <tr>
                <th>Business</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Category</th>
                <th>Location</th>
                <th>Next follow-up</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td data-label="Business">
                    <Link to={`/prospects/${p.id}`}>{p.business_name}</Link>
                    {p.contact_name && <div className="muted" style={{ fontSize: '0.82rem' }}>{p.contact_name}</div>}
                  </td>
                  <td data-label="Status"><StampBadge status={p.status} /></td>
                  <td data-label="Owner">{p.assigned_salesperson?.full_name ?? <span className="muted">Unassigned</span>}</td>
                  <td data-label="Category">{BUSINESS_CATEGORY_LABEL[p.business_category]}</td>
                  <td data-label="Location">{p.location ?? '—'}</td>
                  <td data-label="Next follow-up">
                    {p.next_follow_up_at ? (
                      <span className={new Date(p.next_follow_up_at) < new Date() ? '' : 'muted'}>
                        {relativeDay(p.next_follow_up_at)}
                      </span>
                    ) : '—'}
                  </td>
                  <td data-label="Created">{formatDate(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
