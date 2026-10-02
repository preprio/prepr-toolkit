// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createPreprClient } from './graphql';
import { PREPR_LOCALS_KEY } from './hooks';

const ok = () => new Response(JSON.stringify({ data: {} }));

describe('sveltekit createPreprClient', () => {
  it('reads Prepr headers from locals and uses event.fetch', async () => {
    const eventFetch = vi.fn<typeof globalThis.fetch>(async () => ok());
    const client = createPreprClient({ url: 'https://graphql.prepr.io/t' });

    await client.query('{ Page { _id } }', undefined, {
      personalize: true,
      event: {
        request: new Request('https://site.test/'),
        locals: {
          [PREPR_LOCALS_KEY]: new Headers({ 'Prepr-Segments': 'vip' }),
        },
        fetch: eventFetch,
      },
    });

    const init = eventFetch.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('Prepr-Segments')).toBe('vip');
  });

  it('falls back to request headers when locals has no Prepr headers', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => ok());
    const client = createPreprClient({
      url: 'https://graphql.prepr.io/t',
      fetch,
    });

    await client.query('{ Page { _id } }', undefined, {
      personalize: true,
      event: {
        request: new Request('https://site.test/', {
          headers: { 'Prepr-Segments': 'from-request' },
        }),
      },
    });

    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('Prepr-Segments')).toBe(
      'from-request',
    );
  });
});
