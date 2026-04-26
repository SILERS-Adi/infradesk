import { canAccess, canAccessResource, effectiveLevel, visibleModules, MODULES, type MembershipContext } from '../../src/utils/canAccess';

function ctx(partial: Partial<MembershipContext>): MembershipContext {
  return {
    role: 'MEMBER',
    scope: 'FULL',
    overrides: [],
    grants: [],
    isSuperAdmin: false,
    ...partial,
  };
}

describe('canAccess — OWNER', () => {
  it('has DELETE level everywhere', () => {
    const c = ctx({ role: 'OWNER' });
    for (const m of Object.values(MODULES)) {
      expect(effectiveLevel(c, m)).toBe('DELETE');
      expect(canAccess(c, m, 'delete')).toBe(true);
    }
  });
});

describe('canAccess — ADMIN', () => {
  it('has DELETE level by default but can be restricted by overrides', () => {
    const c = ctx({ role: 'ADMIN', overrides: [{ moduleKey: MODULES.VAULT, level: 'NONE' }] });
    expect(canAccess(c, MODULES.TICKETS, 'delete')).toBe(true);
    expect(canAccess(c, MODULES.VAULT, 'view')).toBe(false);
  });
});

describe('canAccess — MEMBER defaults', () => {
  const c = ctx({ role: 'MEMBER' });
  it('cannot view billing by default', () => {
    expect(canAccess(c, MODULES.BILLING, 'view')).toBe(false);
  });
  it('cannot view vault by default', () => {
    expect(canAccess(c, MODULES.VAULT, 'view')).toBe(false);
  });
  it('can edit tickets by default', () => {
    expect(canAccess(c, MODULES.TICKETS, 'edit')).toBe(true);
  });
  it('can view devices but not edit', () => {
    expect(canAccess(c, MODULES.DEVICES, 'view')).toBe(true);
    expect(canAccess(c, MODULES.DEVICES, 'edit')).toBe(false);
  });
});

describe('canAccess — overrides win over role defaults', () => {
  it('grants edit on vault when override says so', () => {
    const c = ctx({ role: 'MEMBER', overrides: [{ moduleKey: MODULES.VAULT, level: 'EDIT' }] });
    expect(canAccess(c, MODULES.VAULT, 'edit')).toBe(true);
    expect(canAccess(c, MODULES.VAULT, 'delete')).toBe(false);
  });
  it('removes admin-default access when override says NONE', () => {
    const c = ctx({ role: 'ADMIN', overrides: [{ moduleKey: MODULES.AUDIT_LOG, level: 'NONE' }] });
    expect(canAccess(c, MODULES.AUDIT_LOG, 'view')).toBe(false);
  });
});

describe('canAccessResource — SCOPED', () => {
  const c = ctx({
    role: 'MEMBER', scope: 'SCOPED',
    overrides: [{ moduleKey: MODULES.DEVICES, level: 'EDIT' }],
    grants: [{ resourceType: 'DEVICE', resourceId: 'dev-1', level: 'EDIT' }],
  });
  it('allows the granted resource', () => {
    expect(canAccessResource(c, MODULES.DEVICES, 'edit', { type: 'DEVICE', id: 'dev-1' })).toBe(true);
  });
  it('denies ungranted resource', () => {
    expect(canAccessResource(c, MODULES.DEVICES, 'edit', { type: 'DEVICE', id: 'dev-2' })).toBe(false);
  });
});

describe('canAccess — super admin bypass', () => {
  it('has DELETE everywhere irrespective of role', () => {
    const c = ctx({ role: 'MEMBER', isSuperAdmin: true, overrides: [{ moduleKey: MODULES.VAULT, level: 'NONE' }] });
    expect(canAccess(c, MODULES.VAULT, 'delete')).toBe(true);
  });
});

describe('visibleModules', () => {
  it('returns modules with at least VIEW for MEMBER', () => {
    const c = ctx({ role: 'MEMBER' });
    const visible = visibleModules(c);
    expect(visible).toContain(MODULES.TICKETS);
    expect(visible).toContain(MODULES.DEVICES);
    expect(visible).not.toContain(MODULES.VAULT);
    expect(visible).not.toContain(MODULES.BILLING);
  });
});
