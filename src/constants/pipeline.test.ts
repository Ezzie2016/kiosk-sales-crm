import { describe, expect, it } from 'vitest';
import {
  ACTIVE_STATUSES,
  allowedTransitions,
  canTransition,
  isActiveStatus,
  PIPELINE_STATUSES,
  STATUS_ENTRY_TIMESTAMP,
} from './pipeline';

describe('canTransition', () => {
  it('rejects a no-op transition to the same status', () => {
    for (const status of PIPELINE_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it('allows marking any non-lost prospect as lost', () => {
    for (const status of PIPELINE_STATUSES) {
      if (status === 'lost') continue;
      expect(canTransition(status, 'lost')).toBe(true);
    }
  });

  it('allows reactivating a lost prospect into any active stage', () => {
    expect(canTransition('lost', 'new')).toBe(true);
    expect(canTransition('lost', 'demo')).toBe(true);
    expect(canTransition('lost', 'paid')).toBe(true);
    expect(canTransition('lost', 'lost')).toBe(false);
  });

  it('only lets a paid prospect move to lost (churn), never back into the funnel', () => {
    expect(canTransition('paid', 'lost')).toBe(true);
    expect(canTransition('paid', 'trial')).toBe(false);
    expect(canTransition('paid', 'new')).toBe(false);
    expect(canTransition('paid', 'demo')).toBe(false);
  });

  it('allows forward jumps and backward corrections between active stages', () => {
    expect(canTransition('new', 'demo')).toBe(true); // jump ahead
    expect(canTransition('demo', 'contacted')).toBe(true); // correct a mistaken advance
    expect(canTransition('trial', 'paid')).toBe(true);
  });
});

describe('allowedTransitions', () => {
  it('never includes the current status', () => {
    for (const status of PIPELINE_STATUSES) {
      expect(allowedTransitions(status)).not.toContain(status);
    }
  });

  it('from paid, offers only lost', () => {
    expect(allowedTransitions('paid')).toEqual(['lost']);
  });
});

describe('STATUS_ENTRY_TIMESTAMP', () => {
  it('maps trial, paid and lost to their stamp columns', () => {
    expect(STATUS_ENTRY_TIMESTAMP.trial).toBe('trial_started_at');
    expect(STATUS_ENTRY_TIMESTAMP.paid).toBe('paid_at');
    expect(STATUS_ENTRY_TIMESTAMP.lost).toBe('lost_at');
  });

  it('has no stamp column for the early funnel stages', () => {
    expect(STATUS_ENTRY_TIMESTAMP.new).toBeUndefined();
    expect(STATUS_ENTRY_TIMESTAMP.contacted).toBeUndefined();
    expect(STATUS_ENTRY_TIMESTAMP.replied).toBeUndefined();
    expect(STATUS_ENTRY_TIMESTAMP.demo).toBeUndefined();
  });
});

describe('isActiveStatus', () => {
  it('counts the workable stages and excludes paid/lost', () => {
    for (const status of ACTIVE_STATUSES) {
      expect(isActiveStatus(status)).toBe(true);
    }
    expect(isActiveStatus('paid')).toBe(false);
    expect(isActiveStatus('lost')).toBe(false);
  });
});
