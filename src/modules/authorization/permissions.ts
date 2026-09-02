/**
 * Authorization matrix (spec §1, §11, §19).
 *
 * IMPORTANT: this module is NOT the security boundary. Every rule here is also
 * enforced by row-level-security policies and triggers in the `crm` schema — a
 * salesperson who crafts a raw API call still cannot touch another rep's
 * prospect. These functions exist to (a) gate the UI so people are not offered
 * actions that will fail, and (b) give the rules one readable, unit-tested
 * definition that the SQL policies are written to match.
 */
import type { StaffRole } from '@/constants/roles';
import type { PipelineStatus } from '@/constants/pipeline';

export interface Actor {
  id: string;
  role: StaffRole;
  isActive: boolean;
}

export interface ProspectRef {
  assignedSalespersonId: string | null;
  status: PipelineStatus;
}

function isAdmin(actor: Actor): boolean {
  return actor.isActive && actor.role === 'admin';
}

function isActiveStaff(actor: Actor): boolean {
  return actor.isActive && (actor.role === 'admin' || actor.role === 'salesperson');
}

function ownsProspect(actor: Actor, prospect: ProspectRef): boolean {
  return prospect.assignedSalespersonId !== null && prospect.assignedSalespersonId === actor.id;
}

/** Admin sees every prospect; a salesperson sees only their own list. */
export function canViewAllProspects(actor: Actor): boolean {
  return isAdmin(actor);
}

export function canViewProspect(actor: Actor, prospect: ProspectRef): boolean {
  if (!actor.isActive) return false;
  return isAdmin(actor) || ownsProspect(actor, prospect);
}

export function canCreateProspect(actor: Actor): boolean {
  return isActiveStaff(actor);
}

/** Editing prospect fields (contact info, notes, follow-up). Not assignment, not status — those have their own checks. */
export function canEditProspect(actor: Actor, prospect: ProspectRef): boolean {
  if (!actor.isActive) return false;
  return isAdmin(actor) || ownsProspect(actor, prospect);
}

/** Hard delete. Admin only (spec §1 — salespeople must not delete historical records). */
export function canDeleteProspect(actor: Actor): boolean {
  return isAdmin(actor);
}

/** Assign or reassign a prospect to a salesperson. Admin only (spec §1). */
export function canAssignProspect(actor: Actor): boolean {
  return isAdmin(actor);
}

export function canChangeStatus(actor: Actor, prospect: ProspectRef): boolean {
  if (!actor.isActive) return false;
  return isAdmin(actor) || ownsProspect(actor, prospect);
}

/**
 * Change salesperson attribution. Admin only in every case, and specifically
 * still admin-only once the prospect has converted (`status === 'paid'`) —
 * spec §11. A salesperson can never change attribution, converted or not.
 */
export function canChangeAttribution(actor: Actor, _prospect: ProspectRef): boolean {
  return isAdmin(actor);
}

export function canRecordActivity(actor: Actor, prospect: ProspectRef): boolean {
  if (!actor.isActive) return false;
  return isAdmin(actor) || ownsProspect(actor, prospect);
}

/** Create / deactivate salespeople, view all performance (spec §1, §15). */
export function canManageSalespeople(actor: Actor): boolean {
  return isAdmin(actor);
}

export function canViewAllPerformance(actor: Actor): boolean {
  return isAdmin(actor);
}

/** Create / edit / verify payment records. Admin only (spec §1 — salespeople must not modify payment records). */
export function canManagePayments(actor: Actor): boolean {
  return isAdmin(actor);
}

export function canViewPayments(actor: Actor, prospect: ProspectRef): boolean {
  if (!actor.isActive) return false;
  return isAdmin(actor) || ownsProspect(actor, prospect);
}

export function canExportData(actor: Actor): boolean {
  return isAdmin(actor);
}

export function canViewAuditLog(actor: Actor): boolean {
  return isAdmin(actor);
}
