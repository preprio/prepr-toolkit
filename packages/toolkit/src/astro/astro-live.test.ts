// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { normalizeQuery, onPreprRequest } from './index';

const QUERY = '{ Post { _id title } }';
const data = { Post: { _id: 'p', title: 'Old' } };
const LOG = [{ type: 'field', itemId: 'p', field: 'title', value: 'New' }];

function liveRequest(origin = 'https://site.example'): Request {
  return new Request('https://site.example/post', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-prepr-live': '1',
      origin,
    },
    body: JSON.stringify({ log: LOG }),
  });
}

async function render(request: Request, preview: boolean) {
  const locals = {};
  let page: typeof data | undefined;
  const response = await onPreprRequest(
    { request, locals },
    async () => {
      page = normalizeQuery(QUERY, data, { enabled: true, locals });
      return new Response('ok');
    },
    { preview },
  );
  return { page: page!, response };
}

describe('Astro live preview', () => {
  it("renders the editor's unsaved changes and keeps the response out of caches", async () => {
    const { page, response } = await render(liveRequest(), true);
    expect(page.Post.title).toBe('New');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('ignores changes when the site is not in preview', async () => {
    const { page, response } = await render(liveRequest(), false);
    expect(page).toBe(data);
    expect(response.headers.get('cache-control')).toBeNull();
  });

  it('ignores changes from another origin', async () => {
    const { page } = await render(
      liveRequest('https://attacker.example'),
      true,
    );
    expect(page).toBe(data);
  });

  it('applies nothing unless the page enables it', async () => {
    const locals = {};
    await onPreprRequest(
      { request: liveRequest(), locals },
      async () => {
        expect(normalizeQuery(QUERY, data, { locals })).toBe(data);
        expect(normalizeQuery(QUERY, data, { enabled: false, locals })).toBe(
          data,
        );
        return new Response('ok');
      },
      { preview: true },
    );
  });
});
