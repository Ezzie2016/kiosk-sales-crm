/**
 * Audit-log presentation helpers (spec §16). Pure. Turns the `old_value` /
 * `new_value` jsonb blobs the triggers write into a short, readable change
 * summary, and maps the `action` slugs to labels.
 */

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  'prospect.created': 'Prospect created',
  'prospect.status_changed': 'Status changed',
  'prospect.assigned': 'Prospect assigned',
  'prospect.attribution_changed': 'Attribution changed',
  'prospect.duplicate_override': 'Duplicate override',
  'payment.created': 'Payment recorded',
  'payment.updated': 'Payment updated',
  'staff.activated': 'Staff activated',
  'staff.deactivated': 'Staff deactivated',
  'staff.role_changed': 'Staff role changed',
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABEL[action] ?? action;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function scalar(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v === '' ? '—' : v;
  return JSON.stringify(v);
}

/**
 * `field: old → new` for every key present in either object, one per line.
 * Falls back to compact JSON if the values aren't objects.
 */
export function summarizeChange(oldValue: unknown, newValue: unknown): string {
  if (!isPlainObject(oldValue) && !isPlainObject(newValue)) {
    const bits: string[] = [];
    if (oldValue !== null && oldValue !== undefined) bits.push(`was ${scalar(oldValue)}`);
    if (newValue !== null && newValue !== undefined) bits.push(`now ${scalar(newValue)}`);
    return bits.join(', ');
  }
  const before = isPlainObject(oldValue) ? oldValue : {};
  const after = isPlainObject(newValue) ? newValue : {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];

  return keys
    .map((k) => {
      const o = scalar(before[k]);
      const n = scalar(after[k]);
      return o === n ? `${k}: ${n}` : `${k}: ${o} → ${n}`;
    })
    .join('\n');
}
