import { useState } from 'react';
import { useAuditActions, useAuditLog } from './audit-queries';
import { auditActionLabel, summarizeChange } from './audit-format';
import { formatDateTime } from '@/lib/format';

/**
 * Audit log viewer (spec §16) — admin only (mounted under <RequireAdmin>).
 * Read-only: who / action / target / old → new / when.
 */
export function AuditLogPage() {
  const [action, setAction] = useState('');
  const { data: entries, isLoading, error } = useAuditLog({ action: action || undefined });
  const { data: actions } = useAuditActions();

  return (
    <div className="content">
      <div className="page-head">
        <h1>Audit log</h1>
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          {(actions ?? []).map((a) => (
            <option key={a} value={a}>{auditActionLabel(a)}</option>
          ))}
        </select>
      </div>

      {error && <div className="warn">{(error as Error).message}</div>}
      {isLoading && <p className="muted">Loading…</p>}

      {entries && entries.length === 0 && !isLoading && (
        <div className="card"><p className="muted">No audit entries for this filter.</p></div>
      )}

      {entries && entries.length > 0 && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="list">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Target</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td data-label="When" className="num" style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                    {formatDateTime(e.createdAt)}
                  </td>
                  <td data-label="Who">{e.actorName ?? <span className="muted">system</span>}</td>
                  <td data-label="Action">{auditActionLabel(e.action)}</td>
                  <td data-label="Target" style={{ fontSize: '0.82rem' }}>
                    <span className="muted">{e.targetTable.replace(/^crm\./, '')}</span>
                    {e.targetId && <div className="num" style={{ fontSize: '0.75rem' }}>{e.targetId.slice(0, 8)}…</div>}
                  </td>
                  <td data-label="Change" style={{ whiteSpace: 'pre-wrap', fontSize: '0.82rem' }}>
                    {summarizeChange(e.oldValue, e.newValue) || <span className="muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {entries && entries.length >= 200 && (
        <p className="muted" style={{ fontSize: '0.8rem', marginTop: 8 }}>
          Showing the 200 most recent entries. Filter by action to narrow.
        </p>
      )}
    </div>
  );
}
