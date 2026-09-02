import { describe, expect, it } from 'vitest';
import {
  canAssignProspect,
  canChangeAttribution,
  canChangeStatus,
  canDeleteProspect,
  canEditProspect,
  canExportData,
  canManagePayments,
  canManageSalespeople,
  canRecordActivity,
  canViewAllProspects,
  canViewAuditLog,
  canViewProspect,
  type Actor,
  type ProspectRef,
} from './permissions';

const admin: Actor = { id: 'admin-1', role: 'admin', isActive: true };
const repA: Actor = { id: 'rep-a', role: 'salesperson', isActive: true };
const repB: Actor = { id: 'rep-b', role: 'salesperson', isActive: true };
const deactivatedAdmin: Actor = { id: 'admin-1', role: 'admin', isActive: false };

const prospectOfA: ProspectRef = { assignedSalespersonId: 'rep-a', status: 'contacted' };
const paidProspectOfA: ProspectRef = { assignedSalespersonId: 'rep-a', status: 'paid' };
const unassigned: ProspectRef = { assignedSalespersonId: null, status: 'new' };

describe('ownership (spec §23 — rep A cannot touch rep B\'s prospect)', () => {
  it('lets a salesperson view and edit their own prospect', () => {
    expect(canViewProspect(repA, prospectOfA)).toBe(true);
    expect(canEditProspect(repA, prospectOfA)).toBe(true);
    expect(canRecordActivity(repA, prospectOfA)).toBe(true);
    expect(canChangeStatus(repA, prospectOfA)).toBe(true);
  });

  it("denies a salesperson any access to another rep's prospect", () => {
    expect(canViewProspect(repB, prospectOfA)).toBe(false);
    expect(canEditProspect(repB, prospectOfA)).toBe(false);
    expect(canRecordActivity(repB, prospectOfA)).toBe(false);
    expect(canChangeStatus(repB, prospectOfA)).toBe(false);
  });

  it('denies a salesperson an unassigned prospect', () => {
    expect(canViewProspect(repA, unassigned)).toBe(false);
    expect(canEditProspect(repA, unassigned)).toBe(false);
  });
});

describe('admin-only actions (spec §23 — salespeople cannot perform them)', () => {
  it('reassignment is admin only', () => {
    expect(canAssignProspect(admin)).toBe(true);
    expect(canAssignProspect(repA)).toBe(false);
  });

  it('delete is admin only', () => {
    expect(canDeleteProspect(admin)).toBe(true);
    expect(canDeleteProspect(repA)).toBe(false);
  });

  it('payment records are admin only', () => {
    expect(canManagePayments(admin)).toBe(true);
    expect(canManagePayments(repA)).toBe(false);
  });

  it('salesperson management, audit log, export and all-prospect view are admin only', () => {
    for (const check of [canManageSalespeople, canViewAuditLog, canExportData, canViewAllProspects]) {
      expect(check(admin)).toBe(true);
      expect(check(repA)).toBe(false);
    }
  });
});

describe('attribution protection (spec §11)', () => {
  it('a salesperson can never change attribution — not before conversion, not after', () => {
    expect(canChangeAttribution(repA, prospectOfA)).toBe(false);
    expect(canChangeAttribution(repA, paidProspectOfA)).toBe(false);
  });

  it('an admin may change attribution, including after conversion (with authorization)', () => {
    expect(canChangeAttribution(admin, prospectOfA)).toBe(true);
    expect(canChangeAttribution(admin, paidProspectOfA)).toBe(true);
  });
});

describe('deactivated staff', () => {
  it('a deactivated admin loses every permission', () => {
    expect(canViewAllProspects(deactivatedAdmin)).toBe(false);
    expect(canAssignProspect(deactivatedAdmin)).toBe(false);
    expect(canManagePayments(deactivatedAdmin)).toBe(false);
    expect(canViewProspect(deactivatedAdmin, prospectOfA)).toBe(false);
  });
});
