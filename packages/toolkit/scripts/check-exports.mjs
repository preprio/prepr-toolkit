// Fails the build if any package.json `exports` target is missing from dist/.
// tsup writes the entry points concurrently, so a missing .d.ts or .d.cts is
// easy to ship unnoticed — types resolve to `any` at the consumer instead of
// erroring.
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));

// Conditions nest (`import` / `require`, each with `types` and `default`).
function collectTargets(entry) {
  if (typeof entry === 'string') return [entry];
  return Object.values(entry).flatMap(collectTargets);
}

const missing = [];
for (const [subpath, entry] of Object.entries(pkg.exports)) {
  const targets = collectTargets(entry);
  for (const target of targets) {
    if (target.includes('*')) continue; // glob subpaths ship as source, not built
    if (!existsSync(new URL(target, root)))
      missing.push(`${subpath} -> ${target}`);
  }
}

if (missing.length) {
  console.error('Missing export targets:\n  ' + missing.join('\n  '));
  process.exit(1);
}
