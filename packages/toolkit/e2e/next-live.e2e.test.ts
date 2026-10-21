// @vitest-environment node
//
// Live preview for Next.js server components, end to end against a real
// `next build` + `next start` of the app in ./next-live. Run with
// `pnpm test:e2e` (builds the package first). It exercises the server action
// over HTTP exactly as the browser calls it, so it fails when a Next.js
// release changes how a server action hands state to its re-render.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const APP = join(__dirname, 'next-live');
const NEXT = join(__dirname, '..', 'node_modules', '.bin', 'next');

const LOG = [
  {
    type: 'field',
    itemId: 'sbs-1',
    field: 'content.headlineStyle',
    value: 'H1',
  },
  {
    type: 'field',
    itemId: 'sbs-1',
    field: 'content.headline',
    value: 'Typed headline',
  },
  { type: 'field', itemId: 'logos-1', field: 'style', value: 'MONO' },
];

let server: ChildProcess | undefined;
let base = '';
let actionId = '';

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('no port')),
      );
    });
  });
}

async function waitUntilUp(url: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`next start did not answer on ${url}`);
}

/** Call the toolkit's server action the way Next's client runtime does. */
function callAction(path: string, log: unknown, origin = base) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Next-Action': actionId,
      Accept: 'text/x-component',
      'Content-Type': 'text/plain;charset=UTF-8',
      Origin: origin,
    },
    body: JSON.stringify([log]),
  });
}

beforeAll(async () => {
  const build = spawnSync(NEXT, ['build'], { cwd: APP, encoding: 'utf8' });
  if (build.status !== 0) {
    throw new Error(`next build failed:\n${build.stdout}\n${build.stderr}`);
  }
  const manifest = JSON.parse(
    readFileSync(
      join(APP, '.next/server/server-reference-manifest.json'),
      'utf8',
    ),
  ) as { node: Record<string, { exportedName?: string }> };
  const entry = Object.entries(manifest.node).find(
    ([, value]) => value.exportedName === 'syncPreprLiveLog',
  );
  if (!entry)
    throw new Error('syncPreprLiveLog was not compiled as a server action');
  actionId = entry[0];

  const port = await freePort();
  base = `http://localhost:${port}`;
  server = spawn(NEXT, ['start', '-p', String(port)], {
    cwd: APP,
    stdio: 'ignore',
  });
  await waitUntilUp(base);
}, 240_000);

afterAll(() => {
  server?.kill();
});

describe('live preview for server components (next build)', () => {
  it('renders stored content on a normal request', async () => {
    const html = await (await fetch(`${base}/live`)).text();
    expect(html).toContain('<h2>Stored headline</h2>');
    expect(html).toContain('logo-style:<!-- -->COLOR');
  });

  it("re-renders the editor's unsaved changes in the action response", async () => {
    const res = await callAction('/live', LOG);
    expect(res.status).toBe(200);
    const payload = await res.text();
    expect(payload).toContain('Typed headline');
    expect(payload).toContain('MONO');
    expect(payload).toMatch(/"h1"/);

    // Only a token travels, and the browser is told to discard it.
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^__prepr_live=[0-9a-f]{32};/);
    expect(cookie).toMatch(/Max-Age=0/i);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it('never applies changes to a plain request, even with a replayed token', async () => {
    const res = await callAction('/live', LOG);
    const token = /__prepr_live=([0-9a-f]{32})/.exec(
      res.headers.get('set-cookie') ?? '',
    )?.[1];
    expect(token).toBeDefined();

    const replayed = await fetch(`${base}/live`, {
      headers: { Cookie: `__prepr_live=${token}` },
    });
    const html = await replayed.text();
    expect(html).toContain('Stored headline');
    expect(html).not.toContain('Typed headline');
  });

  it('ignores a cookie that carries changes instead of a token', async () => {
    const res = await fetch(`${base}/live`, {
      headers: {
        Cookie: `__prepr_live=${encodeURIComponent(JSON.stringify(LOG))}`,
      },
    });
    expect(await res.text()).not.toContain('Typed headline');
  });

  it('leaves a page that does not enable it unchanged and static', async () => {
    const res = await callAction('/static', LOG);
    expect(await res.text()).not.toContain('Typed headline');
    // `enabled: false` never reads the request, so the route was prerendered.
    const routes = JSON.parse(
      readFileSync(join(APP, '.next/prerender-manifest.json'), 'utf8'),
    ) as { routes: Record<string, unknown> };
    expect(Object.keys(routes.routes)).toContain('/static');
    expect(Object.keys(routes.routes)).not.toContain('/live');
  });

  it('rejects the action from another origin', async () => {
    const res = await callAction('/live', LOG, 'https://attacker.example');
    expect(res.status).not.toBe(200);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(await res.text()).not.toContain('Typed headline');
  });
});
