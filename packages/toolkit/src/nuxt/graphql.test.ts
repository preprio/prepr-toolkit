// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createPreprClient } from './graphql';
import { PREPR_CONTEXT_KEY } from './middleware';

describe('nuxt createPreprClient', () => {
  it('forwards the Prepr headers the middleware stored on event.context', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify({ data: {} })),
    );
    const client = createPreprClient({
      url: 'https://graphql.prepr.io/t',
      fetch,
    });
    const event = {
      context: {
        [PREPR_CONTEXT_KEY]: new Headers({ 'Prepr-Segments': 'vip' }),
      },
    };

    await client.query('{ Page { _id } }', undefined, {
      personalize: true,
      event,
    });

    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('Prepr-Segments')).toBe('vip');
  });
});
