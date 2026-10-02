// Fails the build if any package.json `exports` target is missing from dist/,
// or if an entry point outside the GraphQL client reaches the `graphql`
// package.
//
// tsup writes the entry points concurrently, so a missing .d.ts is easy to
// ship unnoticed — types resolve to `any` at the consumer instead of erroring.
//
// `graphql` is an optional peer used only by the `*/graphql` entries. Any
// other entry importing it, directly or through a shared chunk, breaks the
// build of every consumer who has not installed it.
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));

// `from "x"`, side-effect `import "x"` and `require("x")` in esbuild output.
const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;

function reachesGraphql(fileUrl, seen = new Set()) {
  if (seen.has(fileUrl.href)) return false;
  seen.add(fileUrl.href);
  const code = readFileSync(fileUrl, 'utf8');
  for (const [, specifier] of code.matchAll(SPECIFIER)) {
    if (specifier === 'graphql' || specifier.startsWith('graphql/')) {
      return true;
    }
    if (specifier.startsWith('.')) {
      const next = new URL(specifier, fileUrl);
      if (existsSync(next) && reachesGraphql(next, seen)) return true;
    }
  }
  return false;
}

const missing = [];
const leaking = [];
for (const [subpath, entry] of Object.entries(pkg.exports)) {
  const targets = typeof entry === 'string' ? [entry] : Object.values(entry);
  for (const target of targets) {
    if (target.includes('*')) continue; // glob subpaths ship as source, not built
    const url = new URL(target, root);
    if (!existsSync(url)) {
      missing.push(`${subpath} -> ${target}`);
      continue;
    }
    const isScript = target.endsWith('.js') || target.endsWith('.cjs');
    if (isScript && !subpath.endsWith('/graphql') && reachesGraphql(url)) {
      leaking.push(`${subpath} -> ${target}`);
    }
  }
}

if (missing.length) {
  console.error('Missing export targets:\n  ' + missing.join('\n  '));
}
if (leaking.length) {
  console.error(
    'Entry points that must not import the optional `graphql` peer:\n  ' +
      leaking.join('\n  '),
  );
}
if (missing.length || leaking.length) process.exit(1);
