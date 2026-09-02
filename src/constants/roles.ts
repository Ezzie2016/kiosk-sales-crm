/**
 * The two CRM roles. Kept deliberately small (spec §1).
 *
 * These are a stable state set, not a configurable list — they map 1:1 to the
 * `crm.staff_role` Postgres enum and to row-level-security policy branches, so
 * adding a role is a schema + policy change, never just a constant edit.
 */
export const STAFF_ROLES = ['admin', 'salesperson'] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  admin: 'Admin',
  salesperson: 'Salesperson',
};

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value);
}
