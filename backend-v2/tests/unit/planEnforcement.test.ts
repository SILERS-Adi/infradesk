import {
  meetsPlanRequirement,
  planUpgradeRequired,
  MODULE_MIN_PLAN,
  MODULES,
} from '../../src/utils/canAccess';

describe('plan enforcement / meetsPlanRequirement (P1.1)', () => {
  it('allows any plan for modules without minimum requirement', () => {
    expect(meetsPlanRequirement('START', MODULES.TICKETS)).toBe(true);
    expect(meetsPlanRequirement('START', MODULES.DEVICES)).toBe(true);
    expect(meetsPlanRequirement('START', MODULES.SESSIONS)).toBe(true);
    expect(meetsPlanRequirement('START', MODULES.CLIENTS)).toBe(true);
  });

  it('blocks AI_COPILOT/BACKUPS/REPORTS on START', () => {
    expect(meetsPlanRequirement('START', MODULES.AI_COPILOT)).toBe(false);
    expect(meetsPlanRequirement('START', MODULES.BACKUPS)).toBe(false);
    expect(meetsPlanRequirement('START', MODULES.REPORTS)).toBe(false);
  });

  it('allows AI_COPILOT/BACKUPS only on PRO and above', () => {
    expect(meetsPlanRequirement('TEAM', MODULES.BACKUPS)).toBe(false);
    expect(meetsPlanRequirement('PRO', MODULES.BACKUPS)).toBe(true);
    expect(meetsPlanRequirement('ENTERPRISE', MODULES.BACKUPS)).toBe(true);
    expect(meetsPlanRequirement('PRO', MODULES.AI_COPILOT)).toBe(true);
  });

  it('blocks MONITORING/INVOICES on START but allows from TEAM', () => {
    expect(meetsPlanRequirement('START', MODULES.MONITORING)).toBe(false);
    expect(meetsPlanRequirement('TEAM', MODULES.MONITORING)).toBe(true);
    expect(meetsPlanRequirement('PRO', MODULES.MONITORING)).toBe(true);
    expect(meetsPlanRequirement('START', MODULES.INVOICES)).toBe(false);
    expect(meetsPlanRequirement('TEAM', MODULES.INVOICES)).toBe(true);
  });

  it('GPS is ENTERPRISE-only', () => {
    expect(meetsPlanRequirement('START', MODULES.GPS)).toBe(false);
    expect(meetsPlanRequirement('TEAM', MODULES.GPS)).toBe(false);
    expect(meetsPlanRequirement('PRO', MODULES.GPS)).toBe(false);
    expect(meetsPlanRequirement('ENTERPRISE', MODULES.GPS)).toBe(true);
  });
});

describe('plan enforcement / planUpgradeRequired (returns required tier)', () => {
  it('returns null when access already allowed', () => {
    expect(planUpgradeRequired('PRO', MODULES.BACKUPS)).toBeNull();
    expect(planUpgradeRequired('START', MODULES.TICKETS)).toBeNull();
  });

  it('returns the required plan when access denied', () => {
    expect(planUpgradeRequired('START', MODULES.BACKUPS)).toBe('PRO');
    expect(planUpgradeRequired('START', MODULES.MONITORING)).toBe('TEAM');
    expect(planUpgradeRequired('PRO', MODULES.GPS)).toBe('ENTERPRISE');
  });
});

describe('MODULE_MIN_PLAN map sanity', () => {
  it('only references known MODULES keys', () => {
    const knownModules = new Set(Object.values(MODULES));
    for (const moduleKey of Object.keys(MODULE_MIN_PLAN)) {
      expect(knownModules.has(moduleKey as typeof MODULES[keyof typeof MODULES])).toBe(true);
    }
  });

  it('BILLING is intentionally NOT plan-gated (owner musi widzieć upgrade)', () => {
    expect(MODULE_MIN_PLAN[MODULES.BILLING]).toBeUndefined();
  });
});
