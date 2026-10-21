// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { readLiveLogFromRequest } from './live-request';

const LOG = [{ type: 'field', itemId: 'p', field: 'title', value: 'New' }];

function liveRequest(
  overrides: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Request {
  const headers = {
    'content-type': 'application/json',
    'x-prepr-live': '1',
    origin: 'https://site.example',
    ...overrides.headers,
  };
  const method = overrides.method ?? 'POST';
  return new Request('https://site.example/page', {
    method,
    headers,
    body:
      method === 'GET'
        ? undefined
        : (overrides.body ?? JSON.stringify({ log: LOG })),
  });
}

describe('readLiveLogFromRequest', () => {
  it('reads the log of a same-origin live re-render', async () => {
    expect(await readLiveLogFromRequest(liveRequest())).toEqual(LOG);
  });

  it('ignores every other request', async () => {
    expect(
      await readLiveLogFromRequest(liveRequest({ method: 'GET' })),
    ).toEqual([]);
    expect(
      await readLiveLogFromRequest(
        liveRequest({ headers: { 'x-prepr-live': '' } }),
      ),
    ).toEqual([]);
    expect(
      await readLiveLogFromRequest(
        liveRequest({ headers: { origin: 'https://attacker.example' } }),
      ),
    ).toEqual([]);
    expect(
      await readLiveLogFromRequest(
        liveRequest({ headers: { 'content-type': 'text/plain' } }),
      ),
    ).toEqual([]);
    const noOrigin = liveRequest();
    noOrigin.headers.delete('origin');
    expect(await readLiveLogFromRequest(noOrigin)).toEqual([]);
  });

  it('never throws on malformed or oversized bodies', async () => {
    expect(
      await readLiveLogFromRequest(liveRequest({ body: '{nope' })),
    ).toEqual([]);
    expect(
      await readLiveLogFromRequest(
        liveRequest({ body: 'x'.repeat(1_000_001) }),
      ),
    ).toEqual([]);
    expect(
      await readLiveLogFromRequest(
        liveRequest({
          body: JSON.stringify({
            log: [{ type: 'field', itemId: 'p', field: '__proto__', value: 1 }],
          }),
        }),
      ),
    ).toEqual([{ type: 'field', itemId: 'p', field: '__proto__', value: 1 }]);
  });
});
