import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadPolicySet, loadDefaultPolicies } from './cedar-engine.js';

function readCedarFiles(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.cedar'))
    .sort();
  if (files.length === 0) return null;
  return files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n\n');
}

export function initPolicies(policyDir: string): void {
  const combined = readCedarFiles(policyDir);
  if (combined === null) {
    loadDefaultPolicies();
    console.log(
      '[cedar-auth] No .cedar files found in %s — using default allow-all-authenticated policy.',
      policyDir,
    );
  } else {
    loadPolicySet(combined);
    console.log('[cedar-auth] Loaded custom policies from %s', policyDir);
  }
}

export function watchPolicies(
  policyDir: string,
  onChange: (policyText: string | null) => void,
): fs.FSWatcher | null {
  if (!fs.existsSync(policyDir)) return null;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const watcher = fs.watch(policyDir, () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const combined = readCedarFiles(policyDir);
      onChange(combined);
    }, 200);
  });

  return watcher;
}
