// @vitest-environment node
import {
  vercelStegaCombine,
  vercelStegaDecode,
  vercelStegaSplit,
} from '@vercel/stega';
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
  it('adds list entry ids to edit links in preview', () => {
    const page = normalizeQuery(QUERY, STEGA_PAGE, { enabled: true });
    expect(entryOf(page.Page.content[0].body)).toBe('text-1');
    expect(normalizeQuery(QUERY, STEGA_PAGE)).toBe(STEGA_PAGE);
  });
});

const STEGA_PAGE = {
  Page: {
    _id: 'page-1',
    content: [
      {
        _id: 'text-1',
        body: vercelStegaCombine(
          'Hi',
          {
            origin: 'prepr.io',
            href: 'https://acme.prepr.io/content/edit/page-1?locale=en-US',
          },
          false,
        ),
      },
    ],
  },
};

function entryOf(value: string): string | null {
  const { href } = vercelStegaDecode(vercelStegaSplit(value).encoded) as {
    href: string;
  };
  return new URL(href).searchParams.get('entry');
}
