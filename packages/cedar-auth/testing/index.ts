import * as path from 'node:path';
import * as fs from 'node:fs';
import { loadPolicySet, loadDefaultPolicies, authorize } from '../src/cedar-engine.js';
import { buildEntities, buildPrincipal, buildResource, buildAction } from '../src/entity-builder.js';
import type { CedarUser } from '../src/types.js';

export interface TestAuthorizeInput {
  /** Paths to .cedar policy files, OR inline policy text. */
  policies?: string[] | string;
  principal: CedarUser;
  action: 'HttpGet' | 'HttpPost' | 'HttpPut' | 'HttpDelete' | 'HttpPatch';
  resourcePath: string;
  serviceName: string;
  context?: Record<string, string>;
}

export interface TestAuthorizeResult {
  allowed: boolean;
}

export async function testAuthorize(input: TestAuthorizeInput): Promise<TestAuthorizeResult> {
  const { principal, action: actionName, resourcePath, serviceName } = input;

  if (!input.policies) {
    loadDefaultPolicies();
  } else if (typeof input.policies === 'string') {
    loadPolicySet(input.policies);
  } else {
    const texts = input.policies.map((p) => {
      const resolved = path.resolve(p);
      return fs.existsSync(resolved) ? fs.readFileSync(resolved, 'utf8') : p;
    });
    loadPolicySet(texts.join('\n\n'));
  }

  const actionUid = buildAction(actionName.replace('Http', ''));
  if (!actionUid) throw new Error(`Unknown action: ${actionName}`);

  const principalUid = buildPrincipal(principal);
  const resourceUid = buildResource(serviceName, resourcePath);
  const entities = buildEntities(principal, serviceName, resourcePath);
  const context = {
    path: resourcePath,
    method: actionName.replace('Http', '').toUpperCase(),
    ip: '',
    serviceName,
    ...input.context,
  };

  const allowed = authorize(principalUid, actionUid, resourceUid, context, entities);
  return { allowed };
}
