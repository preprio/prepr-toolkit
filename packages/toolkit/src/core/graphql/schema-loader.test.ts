// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { loadPreprSchema } from './schema-loader';

const URL_ = 'https://graphql.prepr.io/secret-token-in-url';
const introspection = {
  data: {
    __schema: {
      queryType: { name: 'Query' },
      types: [{ name: 'Query', fields: [] }],
    },
  },
};

describe('loadPreprSchema', () => {
  it('fetches the schema once per URL', async () => {
    const fetch = vi.fn(
      async () => new Response(JSON.stringify(introspection)),
    );
    const url = `${URL_}-a`;

    const a = await loadPreprSchema(url, { fetch });
    const b = await loadPreprSchema(url, { fetch });

    expect(a).toBe(b);
    expect(a.queryType).toBe('Query');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failure, and keeps the URL out of the error', async () => {
    const url = `${URL_}-b`;
    const failing = vi.fn(async () => new Response('down', { status: 500 }));
    const error = await loadPreprSchema(url, { fetch: failing }).catch(
      (e: unknown) => e as Error,
    );
    expect((error as Error).name).toBe('PreprError');
    expect(String((error as Error).message)).not.toContain('secret-token');

    const ok = vi.fn(async () => new Response(JSON.stringify(introspection)));
    await expect(loadPreprSchema(url, { fetch: ok })).resolves.toBeTruthy();
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('does not cache a 200 response that is not a schema, and reports it as a PreprError', async () => {
    const url = `${URL_}-c`;
    const wrong = vi.fn(
      async () => new Response(JSON.stringify({ data: { foo: 1 } })),
    );
    const error = await loadPreprSchema(url, { fetch: wrong }).catch(
      (e: unknown) => e as Error,
    );
    expect((error as Error).name).toBe('PreprError');
    expect((error as { code?: string }).code).toBe('INVALID_RESPONSE');

    const ok = vi.fn(async () => new Response(JSON.stringify(introspection)));
    await expect(loadPreprSchema(url, { fetch: ok })).resolves.toBeTruthy();
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('rejects a URL that is not a Prepr GraphQL URL, like createPreprClient', async () => {
    await expect(loadPreprSchema('not a url')).rejects.toMatchObject({
      name: 'PreprError',
    });
  });
});
