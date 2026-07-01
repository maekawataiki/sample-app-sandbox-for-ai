#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { validatePolicies } from './cedar-engine.js';

const policyDirArg = process.argv.find((a, i) => process.argv[i - 1] === '--policy-dir');
const policyDir = path.resolve(policyDirArg ?? './cedar');

if (!fs.existsSync(policyDir)) {
  console.log(`No cedar/ directory found at ${policyDir} — nothing to validate.`);
  process.exit(0);
}

const cedarFiles = fs
  .readdirSync(policyDir)
  .filter((f) => f.endsWith('.cedar'))
  .sort();

if (cedarFiles.length === 0) {
  console.log('No .cedar files found — nothing to validate.');
  process.exit(0);
}

const combined = cedarFiles
  .map((f) => fs.readFileSync(path.join(policyDir, f), 'utf8'))
  .join('\n\n');

console.log(`Validating ${cedarFiles.length} Cedar policy file(s) in ${policyDir}...`);

const errors = validatePolicies(combined);

if (errors.length === 0) {
  console.log('Cedar policy validation passed.');
  process.exit(0);
} else {
  console.error('Cedar policy validation FAILED:');
  for (const e of errors) {
    console.error(`  - ${e}`);
  }
  process.exit(1);
}
