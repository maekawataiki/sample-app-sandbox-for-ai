import type { RequestHandler } from 'express';
import * as path from 'node:path';
import { verifyAlbJwt, extractUser } from './alb-jwt.js';
import { buildEntities, buildPrincipal, buildResource, buildAction } from './entity-builder.js';
import { authorize, loadPolicySet, loadDefaultPolicies } from './cedar-engine.js';
import { initPolicies, watchPolicies } from './policy-loader.js';
import type { CedarAuthOptions, CedarDecision, CedarUser } from './types.js';

const DEV_USER_DEFAULT: CedarUser = {
  sub: 'dev-local',
  email: 'dev@local',
  groups: [],
};

export function createCedarAuth(opts: CedarAuthOptions = {}): RequestHandler {
  const region = opts.region ?? process.env['AWS_REGION'] ?? 'us-east-1';
  const serviceName = opts.serviceName ?? process.env['SERVICE_NAME'] ?? 'prototype';
  const bypassPaths = opts.bypassPaths ?? ['/healthz'];
  const policyDir = path.resolve(opts.policyDir ?? './cedar');
  const devMode = opts.devMode ?? false;
  const devUser = opts.devUser ?? DEV_USER_DEFAULT;

  if (devMode) {
    console.warn(
      '[cedar-auth] WARNING: devMode is active — JWT verification is disabled. ' +
        'Never use devMode in production.',
    );
  }

  initPolicies(policyDir);

  if (opts.watchPolicies ?? process.env['NODE_ENV'] !== 'production') {
    watchPolicies(policyDir, (combined) => {
      try {
        if (combined === null) {
          loadDefaultPolicies();
          console.log('[cedar-auth] Policies hot-reloaded: reverted to default.');
        } else {
          loadPolicySet(combined);
          console.log('[cedar-auth] Policies hot-reloaded from %s', policyDir);
        }
      } catch (err) {
        console.error('[cedar-auth] Policy hot-reload failed:', err);
      }
    });
  }

  const onDeny =
    opts.onDeny ??
    ((_req, res, decision: CedarDecision) => {
      res.status(403).json({ error: 'Forbidden', detail: decision });
    });

  const onError =
    opts.onError ??
    ((_req, res, err: Error) => {
      console.error('[cedar-auth] Authorization error:', err.message);
      res.status(500).json({ error: 'Authorization error' });
    });

  return async (req, res, next) => {
    if (bypassPaths.includes(req.path)) {
      return next();
    }

    let user: CedarUser;

    if (devMode) {
      user = devUser;
    } else {
      const albData = req.headers['x-amzn-oidc-data'] as string | undefined;
      if (!albData) {
        res.status(401).json({ error: 'Unauthorized', detail: 'Missing x-amzn-oidc-data header' });
        return;
      }
      try {
        const payload = await verifyAlbJwt(albData, region, opts.allowedAlbArns);
        const accessToken = req.headers['x-amzn-oidc-accesstoken'] as string | undefined;
        user = extractUser(payload, accessToken);
      } catch (err) {
        onError(req, res, err instanceof Error ? err : new Error(String(err)));
        return;
      }
    }

    const action = buildAction(req.method);
    if (!action) {
      // Unknown HTTP method — Cedar has no matching action, so deny.
      const decision: CedarDecision = {
        allowed: false,
        principal: user.sub,
        action: req.method,
        resource: req.path,
      };
      onDeny(req, res, decision);
      return;
    }

    const principal = buildPrincipal(user);
    const resource = buildResource(serviceName, req.path);
    const entities = buildEntities(user, serviceName, req.path);
    const context = {
      path: req.path,
      method: req.method,
      ip: req.ip ?? '',
      serviceName,
    };

    let allowed: boolean;
    try {
      allowed = authorize(principal, action, resource, context, entities);
    } catch (err) {
      onError(req, res, err instanceof Error ? err : new Error(String(err)));
      return;
    }

    const decision: CedarDecision = {
      allowed,
      principal: user.sub,
      action: req.method,
      resource: req.path,
    };

    console.log(
      JSON.stringify({
        event: 'cedar_authz',
        allowed,
        principal: user.email,
        action: req.method,
        resource: req.path,
        service: serviceName,
      }),
    );

    if (!allowed) {
      onDeny(req, res, decision);
      return;
    }

    req.cedarUser = user;
    next();
  };
}
