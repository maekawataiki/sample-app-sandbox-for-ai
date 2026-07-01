import { verifyAlbJwt, extractUser } from './alb-jwt.js';
import { buildEntities, buildPrincipal, buildResource, buildAction } from './entity-builder.js';
import { authorize } from './cedar-engine.js';
import { initPolicies } from './policy-loader.js';
import type { CedarUser, CedarAuthOptions } from './types.js';
import * as path from 'node:path';

export interface StandaloneAuthorizeInput {
  headers: Record<string, string | undefined>;
  path: string;
  method: string;
  options?: Pick<
    CedarAuthOptions,
    | 'region'
    | 'serviceName'
    | 'policyDir'
    | 'allowedAlbArns'
    | 'devMode'
    | 'devUser'
  >;
}

export interface StandaloneAuthorizeResult {
  allowed: boolean;
  user?: CedarUser;
  error?: string;
}

let initialized = false;

export async function standaloneAuthorize(
  input: StandaloneAuthorizeInput,
): Promise<StandaloneAuthorizeResult> {
  const opts = input.options ?? {};
  const region = opts.region ?? process.env['AWS_REGION'] ?? 'us-east-1';
  const serviceName = opts.serviceName ?? process.env['SERVICE_NAME'] ?? 'prototype';
  const policyDir = path.resolve(opts.policyDir ?? './cedar');

  if (!initialized) {
    initPolicies(policyDir);
    initialized = true;
  }

  let user: CedarUser;

  if (opts.devMode) {
    user = opts.devUser ?? { sub: 'dev-local', email: 'dev@local', groups: [] };
  } else {
    const albData = input.headers['x-amzn-oidc-data'];
    if (!albData) {
      return { allowed: false, error: 'Missing x-amzn-oidc-data header' };
    }
    try {
      const payload = await verifyAlbJwt(albData, region, opts.allowedAlbArns);
      user = extractUser(payload, input.headers['x-amzn-oidc-accesstoken']);
    } catch (err) {
      return { allowed: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  const action = buildAction(input.method);
  if (!action) {
    return { allowed: false, user, error: `Unknown HTTP method: ${input.method}` };
  }

  const principal = buildPrincipal(user);
  const resource = buildResource(serviceName, input.path);
  const entities = buildEntities(user, serviceName, input.path);
  const context = {
    path: input.path,
    method: input.method,
    ip: '',
    serviceName,
  };

  try {
    const allowed = authorize(principal, action, resource, context, entities);
    return { allowed, user };
  } catch (err) {
    return {
      allowed: false,
      user,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
