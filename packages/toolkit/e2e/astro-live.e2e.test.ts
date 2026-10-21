// @vitest-environment node
//
// Live preview for Astro, end to end against a real `astro build` with the
// Node adapter. It sends the same request `startHtmlLivePreview` sends from
// the editor iframe. The fixture borrows the Astro example's dependencies.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const APP = join(__dirname, 'astro-live');
const EXAMPLE_MODULES = join(__dirname, '../../../examples/astro/node_modules');

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
  throw new Error(`astro server did not answer on ${url}`);
}

function liveRender(path: string, origin = base) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Prepr-Live': '1',
      Origin: origin,
    },
    body: JSON.stringify({ log: LOG }),
  });
}

beforeAll(async () => {
  const modules = join(APP, 'node_modules');
  if (!existsSync(modules)) symlinkSync(EXAMPLE_MODULES, modules, 'dir');
  const build = spawnSync(join(modules, '.bin', 'astro'), ['build'], {
    cwd: APP,
    encoding: 'utf8',
  });
  if (build.status !== 0) {
    throw new Error(`astro build failed:\n${build.stdout}\n${build.stderr}`);
  }
  const port = await freePort();
  base = `http://localhost:${port}`;
  server = spawn(process.execPath, ['dist/server/entry.mjs'], {
    cwd: APP,
    // The example's @astrojs/node crashes in its listening log line with
    // this Astro version; the server itself is unaffected.
    env: {
      ...process.env,
      HOST: 'localhost',
      PORT: String(port),
      ASTRO_NODE_LOGGING: 'disabled',
    },
    stdio: 'ignore',
  });
  await waitUntilUp(base);
}, 240_000);

afterAll(() => {
  server?.kill();
});

describe('live preview for Astro (astro build)', () => {
  it('renders stored content on a normal request', async () => {
    const html = await (await fetch(`${base}/live`)).text();
    expect(html).toContain('<h2>Stored headline</h2>');
    expect(html).toContain('logo-style:COLOR');
  });

  it("renders the editor's unsaved changes for a live re-render", async () => {
    const res = await liveRender('/live');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const html = await res.text();
    expect(html).toContain('<h1>Typed headline</h1>');
    expect(html).toContain('logo-style:MONO');
  });

  it('ignores the changes from another origin', async () => {
    const res = await liveRender('/live', 'https://attacker.example');
    const html = await res.text();
    expect(html).not.toContain('Typed headline');
  });

  it('never applies changes sent with a plain request', async () => {
    const res = await fetch(
      `${base}/live?log=${encodeURIComponent(JSON.stringify(LOG))}`,
      { headers: { 'X-Prepr-Live': '1' } },
    );
    expect(await res.text()).not.toContain('Typed headline');
  });

  it('leaves a page that does not enable it unchanged', async () => {
    const res = await liveRender('/static');
    expect(await res.text()).toContain('<h2>Stored headline</h2>');
  });
});
