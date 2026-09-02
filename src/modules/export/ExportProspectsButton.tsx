import { useState } from 'react';
import { exportRepository } from './export-repository';
import { exportFileName, prospectsCsv } from './prospect-csv';
import type { ProspectFilters } from '@/modules/prospects/prospect-repository';

/** Admin-only CSV export of the currently-filtered prospects (spec §21). */
export function ExportProspectsButton({ filters }: { filters: ProspectFilters }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const { prospects, payments } = await exportRepository.fetch(filters);
      const csv = prospectsCsv(prospects, payments);
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="row" style={{ gap: 8, alignItems: 'baseline' }}>
      <button className="btn" type="button" onClick={run} disabled={busy}>
        {busy ? 'Exporting…' : 'Export CSV'}
      </button>
      {error && <span className="warn">{error}</span>}
    </span>
  );
}
