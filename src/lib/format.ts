/** Display formatting helpers. Amounts are stored as integer kobo. */

export function formatKoboAmount(amountKobo: number): string {
  const naira = amountKobo / 100;
  return naira.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function relativeDay(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '—';
  const diffMs = new Date(iso).getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays === -1) return 'yesterday';
  if (diffDays < 0) return `${-diffDays} days ago`;
  return `in ${diffDays} days`;
}
