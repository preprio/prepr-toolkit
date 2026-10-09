// Shared fixtures for the client test suites in this directory.
import { expect, vi } from 'vitest';

import { PreprError } from '../server';
import { createPreprClient } from './client';

export const TOKEN = 'secret-token-123';
export const GRAPHQL_URL = `https://graphql.prepr.io/${TOKEN}`;
export const PAGE_QUERY =
  'query GetPage($slug: String) { Page(slug: $slug) { _id } }';
// What the client sends: the same query without insignificant whitespace.
export const PAGE_QUERY_SENT =
  'query GetPage($slug:String){Page(slug:$slug){_id}}';

export function respond(
  body: unknown,
  headers: Record<string, string> = {},
  status = 200,
): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers,
  });
}

export function setup(
  response: Response | Error,
  options: { preview?: boolean } = {},
) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  const client = createPreprClient({ url: GRAPHQL_URL, fetch, ...options });
  const init = () => fetch.mock.calls[0]?.[1] as RequestInit;
  const sentQuery = () => JSON.parse(init().body as string).query as string;
  return { client, fetch, init, sentQuery };
}

export async function caught(promise: Promise<unknown>): Promise<PreprError> {
  const error = await promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(PreprError);
  return error as PreprError;
}
