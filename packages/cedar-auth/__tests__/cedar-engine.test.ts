import { loadPolicySet, loadDefaultPolicies, authorize, validatePolicies } from '../src/cedar-engine';
import { buildEntities, buildPrincipal, buildResource, buildAction } from '../src/entity-builder';

const eng = (user: { sub: string; email: string; groups: string[] }, method: string, path = '/') => {
  const action = buildAction(method)!;
  const principal = buildPrincipal(user);
  const resource = buildResource('test-svc', path);
  const entities = buildEntities(user, 'test-svc', path);
  const context = { path, method, ip: '', serviceName: 'test-svc' };
  return authorize(principal, action, resource, context, entities);
};

describe('default policy', () => {
  beforeAll(() => loadDefaultPolicies());

  it('permits authenticated user', () => {
    expect(eng({ sub: 'u1', email: 'u@x.com', groups: [] }, 'GET')).toBe(true);
  });
});

describe('custom policies', () => {
  it('group-restricted policy allows member', () => {
    loadPolicySet(`
      permit(
        principal in Prototype::Group::"engineering",
        action,
        resource
      );
    `);
    expect(eng({ sub: 'u2', email: 'u@x.com', groups: ['engineering'] }, 'GET')).toBe(true);
  });

  it('group-restricted policy denies non-member', () => {
    loadPolicySet(`
      permit(
        principal in Prototype::Group::"engineering",
        action,
        resource
      );
    `);
    expect(eng({ sub: 'u3', email: 'u@x.com', groups: ['viewer'] }, 'GET')).toBe(false);
  });

  it('forbid overrides permit', () => {
    loadPolicySet(`
      permit(principal is Prototype::User, action, resource);
      forbid(
        principal,
        action == Prototype::Action::"HttpDelete",
        resource
      ) unless {
        principal in Prototype::Group::"admin"
      };
    `);
    expect(eng({ sub: 'u4', email: 'u@x.com', groups: [] }, 'DELETE')).toBe(false);
    expect(eng({ sub: 'u5', email: 'u@x.com', groups: ['admin'] }, 'DELETE')).toBe(true);
  });
});

describe('validatePolicies', () => {
  it('returns empty array for valid policy', () => {
    const errs = validatePolicies('permit(principal is Prototype::User, action, resource);');
    expect(errs).toHaveLength(0);
  });

  it('returns errors for policy referencing unknown entity type', () => {
    const errs = validatePolicies('permit(principal is Prototype::UnknownEntity, action, resource);');
    expect(errs.length).toBeGreaterThan(0);
  });
});
