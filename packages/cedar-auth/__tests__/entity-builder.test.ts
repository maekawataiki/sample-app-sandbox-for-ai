import { buildEntities, buildPrincipal, buildResource, buildAction } from '../src/entity-builder';

describe('buildEntities', () => {
  it('includes user, groups, service, and endpoint entities', () => {
    const user = { sub: 'user-1', email: 'a@b.com', groups: ['admin', 'eng'] };
    const entities = buildEntities(user, 'notes', '/api/items');
    const types = entities.map((e) => (e.uid as { __entity: { type: string; id: string } }).__entity.type);
    expect(types).toContain('Prototype::Group');
    expect(types).toContain('Prototype::User');
    expect(types).toContain('Prototype::Service');
    expect(types).toContain('Prototype::Endpoint');
  });

  it('user entity has correct group parents', () => {
    const user = { sub: 'user-1', email: 'a@b.com', groups: ['admin'] };
    const entities = buildEntities(user, 'svc', '/');
    const userEntity = entities.find(
      (e) => (e.uid as { __entity: { type: string } }).__entity.type === 'Prototype::User',
    );
    expect(userEntity?.parents).toHaveLength(1);
    expect((userEntity!.parents[0] as { __entity: { type: string; id: string } }).__entity.id).toBe('admin');
  });
});

describe('buildAction', () => {
  it.each([
    ['GET', 'HttpGet'],
    ['POST', 'HttpPost'],
    ['PUT', 'HttpPut'],
    ['DELETE', 'HttpDelete'],
    ['PATCH', 'HttpPatch'],
  ])('%s maps to %s', (method, expected) => {
    const action = buildAction(method);
    expect(action).not.toBeNull();
    expect((action as { __entity: { id: string } }).__entity.id).toBe(expected);
  });

  it('returns null for unknown methods', () => {
    expect(buildAction('OPTIONS')).toBeNull();
    expect(buildAction('HEAD')).toBeNull();
  });
});

describe('buildPrincipal', () => {
  it('uses sub as entity id', () => {
    const user = { sub: 'abc-123', email: 'x@y.com', groups: [] };
    const p = buildPrincipal(user) as { __entity: { type: string; id: string } };
    expect(p.__entity.type).toBe('Prototype::User');
    expect(p.__entity.id).toBe('abc-123');
  });
});

describe('buildResource', () => {
  it('encodes serviceName::path as endpoint id', () => {
    const r = buildResource('notes-app', '/api/items') as { __entity: { id: string } };
    expect(r.__entity.id).toBe('notes-app::/api/items');
  });
});
