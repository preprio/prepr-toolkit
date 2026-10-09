// @vitest-environment node
//
// The client builds real `Headers`/`Response` objects; happy-dom's versions
// accept values undici rejects, so this suite runs under node.

import { describe, expect, it, vi } from 'vitest';

import { createEventClient } from './event-client';
import { GRAPHQL_URL, PAGE_QUERY, caught, respond } from './test-helpers';

describe('createEventClient', () => {
  type FakeEvent = { headers: Headers; fetch?: typeof globalThis.fetch };

  function eventSetup() {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      respond({ data: {} }),
    );
    const client = createEventClient<FakeEvent>(
      { url: GRAPHQL_URL, fetch },
      { headers: (e) => e.headers, fetch: (e) => e.fetch },
    );
    const init = () => fetch.mock.calls[0]?.[1] as RequestInit;
    return { client, fetch, init };
  }

  const event: FakeEvent = {
    headers: new Headers({
      'Prepr-Segments': 'vip',
      Cookie: 'session=secret',
      Authorization: 'Bearer secret',
    }),
  };

  it('forwards only Prepr headers from the event with personalize', async () => {
    const { client, init } = eventSetup();

    await client.query(PAGE_QUERY, undefined, { personalize: true, event });

    const sent = new Headers(init().headers);
    expect(sent.get('Prepr-Segments')).toBe('vip');
    expect(sent.get('Cookie')).toBeNull();
    expect(sent.get('Authorization')).toBeNull();
    expect(init().cache).toBe('no-store');
  });

  it('lets caller headers win over the request headers', async () => {
    const { client, init } = eventSetup();

    await client.query(PAGE_QUERY, undefined, {
      personalize: true,
      event,
      headers: { 'Prepr-Segments': 'override' },
    });

    expect(new Headers(init().headers).get('Prepr-Segments')).toBe('override');
  });

  it('sends no Prepr headers and stays cacheable without personalize', async () => {
    const { client, init } = eventSetup();

    await client.query(PAGE_QUERY, undefined, { event });

    expect(new Headers(init().headers).get('Prepr-Segments')).toBeNull();
    expect(init().cache).toBeUndefined();
  });

  it('rejects personalize without an event with CONTEXT_ERROR', async () => {
    const { client, fetch } = eventSetup();

    const error = await caught(
      client.query(PAGE_QUERY, undefined, {
        personalize: true,
      } as unknown as { personalize: true; event: FakeEvent }),
    );

    expect(error.code).toBe('CONTEXT_ERROR');
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the adapter's per-event fetch", async () => {
    const { client, fetch } = eventSetup();
    const eventFetch = vi.fn<typeof globalThis.fetch>(async () =>
      respond({ data: {} }),
    );

    await client.query(PAGE_QUERY, undefined, {
      event: { ...event, fetch: eventFetch },
    });

    expect(eventFetch).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });
});
