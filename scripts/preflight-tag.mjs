#!/usr/bin/env node
/**
 * Verifies the checkout is ready to be tagged, catching locally what the release
 * workflow would otherwise catch after the tag is already pushed.
 *
 * Tag deletion is blocked by a repository ruleset, so a tag pushed against the
 * wrong commit burns that version number permanently. Run this first.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const run = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();
const fail = (msg) => {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
};

const pkg = JSON.parse(
  readFileSync(new URL('../packages/toolkit/package.json', import.meta.url)),
);
const version = pkg.version;
const tag = `v${version}`;

const branch = run('git rev-parse --abbrev-ref HEAD');
if (branch !== 'main') {
  fail(`On "${branch}". Releases are tagged from main.`);
}

if (run('git status --porcelain')) {
  fail('Working tree is dirty. Commit or stash before tagging.');
}

run('git fetch origin --tags --quiet');

const local = run('git rev-parse HEAD');
const remote = run('git rev-parse origin/main');
if (local !== remote) {
  fail(
    `main is not in sync with origin/main.\n  local  ${local}\n  origin ${remote}\n\n  Run: git pull`,
  );
}

const versionTs = readFileSync(
  new URL('../packages/toolkit/src/version.ts', import.meta.url),
  'utf8',
);
const match = versionTs.match(/VERSION = '([^']+)'/);
if (!match) fail('Could not read VERSION from src/version.ts.');
if (match[1] !== version) {
  fail(
    `Version mismatch:\n  package.json  ${version}\n  version.ts    ${match[1]}`,
  );
}

const existing = run(`git ls-remote --tags origin refs/tags/${tag}`);
if (existing) {
  fail(
    `${tag} already exists on origin and cannot be deleted (ruleset).\n  Bump to the next patch and tag that instead.`,
  );
}

console.log(`\n  Ready to tag ${tag} at ${local.slice(0, 7)}\n`);
console.log(`  git tag -a ${tag} -m "release: ${tag}"`);
console.log(`  git push origin ${tag}\n`);
