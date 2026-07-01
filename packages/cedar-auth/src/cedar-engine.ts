import * as cedar from '@cedar-policy/cedar-wasm/nodejs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EntityJson, EntityUidJson, Context } from '@cedar-policy/cedar-wasm/nodejs';

const SCHEMA_ID = 'prototype-platform-schema';
const PSET_ID = 'prototype-platform-policies';

const schemaText = fs.readFileSync(
  path.join(__dirname, '..', 'cedar', 'schema.cedarschema'),
  'utf8',
);
const defaultPoliciesText = fs.readFileSync(
  path.join(__dirname, '..', 'cedar', 'default-policies.cedar'),
  'utf8',
);

let schemaLoaded = false;

function ensureSchema(): void {
  if (schemaLoaded) return;
  const result = cedar.preparseSchema(SCHEMA_ID, schemaText);
  if (result.type === 'failure') {
    const msgs = result.errors.map((e) => e.message).join('; ');
    throw new Error(`Cedar schema parse failed: ${msgs}`);
  }
  schemaLoaded = true;
}

export function loadPolicySet(policyText: string): void {
  ensureSchema();
  const result = cedar.preparsePolicySet(PSET_ID, { staticPolicies: policyText });
  if (result.type === 'failure') {
    const msgs = result.errors.map((e) => e.message).join('; ');
    throw new Error(`Cedar policy parse failed: ${msgs}`);
  }
}

export function loadDefaultPolicies(): void {
  loadPolicySet(defaultPoliciesText);
}

export function authorize(
  principal: EntityUidJson,
  action: EntityUidJson,
  resource: EntityUidJson,
  context: Context,
  entities: EntityJson[],
): boolean {
  ensureSchema();
  const result = cedar.statefulIsAuthorized({
    principal,
    action,
    resource,
    context,
    preparsedSchemaName: SCHEMA_ID,
    preparsedPolicySetId: PSET_ID,
    entities,
    validateRequest: true,
  });

  if (result.type === 'failure') {
    const msgs = result.errors.map((e) => e.message).join('; ');
    throw new Error(`Cedar authorization error: ${msgs}`);
  }

  return result.response.decision === 'allow';
}

export function validatePolicies(policyText: string): string[] {
  ensureSchema();
  const result = cedar.validate({
    schema: schemaText,
    policies: { staticPolicies: policyText },
  });
  if (result.type === 'failure') {
    return result.errors.map((e) => e.message);
  }
  return [
    ...result.validationErrors.map((e) => e.error.message),
    ...result.validationWarnings.map((e) => `warning: ${e.error.message}`),
  ];
}

export { defaultPoliciesText };
