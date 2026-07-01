import type { EntityJson, EntityUidJson, CedarValueJson } from '@cedar-policy/cedar-wasm/nodejs';
import type { CedarUser } from './types.js';

function uid(type: string, id: string): EntityUidJson {
  return { __entity: { type, id } };
}

export function buildEntities(
  user: CedarUser,
  serviceName: string,
  path: string,
): EntityJson[] {
  const groupEntities: EntityJson[] = user.groups.map((g) => ({
    uid: uid('Prototype::Group', g),
    attrs: {} as Record<string, CedarValueJson>,
    parents: [],
  }));

  const userEntity: EntityJson = {
    uid: uid('Prototype::User', user.sub),
    attrs: {
      email: user.email,
      sub: user.sub,
    },
    parents: user.groups.map((g) => uid('Prototype::Group', g)),
  };

  const serviceEntity: EntityJson = {
    uid: uid('Prototype::Service', serviceName),
    attrs: { name: serviceName },
    parents: [],
  };

  const endpointId = `${serviceName}::${path}`;
  const endpointEntity: EntityJson = {
    uid: uid('Prototype::Endpoint', endpointId),
    attrs: { path },
    parents: [uid('Prototype::Service', serviceName)],
  };

  return [...groupEntities, userEntity, serviceEntity, endpointEntity];
}

export function buildPrincipal(user: CedarUser): EntityUidJson {
  return uid('Prototype::User', user.sub);
}

export function buildResource(serviceName: string, path: string): EntityUidJson {
  return uid('Prototype::Endpoint', `${serviceName}::${path}`);
}

export function buildAction(method: string): EntityUidJson | null {
  const actionMap: Record<string, string> = {
    GET: 'HttpGet',
    POST: 'HttpPost',
    PUT: 'HttpPut',
    DELETE: 'HttpDelete',
    PATCH: 'HttpPatch',
  };
  const actionId = actionMap[method.toUpperCase()];
  if (!actionId) return null;
  return uid('Prototype::Action', actionId);
}
