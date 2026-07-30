// Fails the build when src/version.ts and package.json disagree.
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);
const src = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8');
const match = src.match(/VERSION = '([^']+)'/);

if (match?.[1] !== pkg.version) {
  console.error(
    `Version mismatch: src/version.ts exports '${match?.[1] ?? '<not found>'}' ` +
      `but package.json says '${pkg.version}'. Update src/version.ts.`
  );
  process.exit(1);
}
