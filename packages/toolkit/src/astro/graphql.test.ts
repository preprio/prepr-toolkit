// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createPreprClient } from './graphql';

describe('astro createPreprClient', () => {
  it('forwards Prepr headers from event.request and drops the rest', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify({ data: {} })),
    );
    const client = createPreprClient({
      url: 'https://graphql.prepr.io/t',
      fetch,
    });
    const request = new Request('https://site.test/', {
      headers: { 'Prepr-Segments': 'vip', 'X-Internal': 'secret' },
    });

    await client.query('{ Page { _id } }', undefined, {
      personalize: true,
      event: { request },
    });

    const sent = new Headers(
      (fetch.mock.calls[0]?.[1] as RequestInit).headers,
    );
    expect(sent.get('Prepr-Segments')).toBe('vip');
    expect(sent.get('X-Internal')).toBeNull();
  });
});
