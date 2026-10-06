// @vitest-environment node
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const enable = vi.fn();
const jar = {
  get: vi.fn(() => ({ name: '__prerender_bypass', value: 'id' })),
  set: vi.fn(),
};
vi.mock('next/headers', () => ({
  draftMode: async () => ({ enable }),
  cookies: async () => jar,
}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { to });
  },
}));

const { createPreprDraftRoute, preprDraftRedirect } = await import('./draft');

function request(path: string, cookie = '', method = 'GET') {
  return new NextRequest(`https://site.test${path}`, {
    method,
    headers: cookie ? { cookie } : {},
  });
}

describe('preprDraftRedirect', () => {
  it('sends a preview visitor without draft mode through the draft route', () => {
    const response = preprDraftRedirect(request('/pricing?x=1'), {
      preview: true,
    });
    expect(response?.headers.get('location')).toBe(
      'https://site.test/api/prepr/draft?to=%2Fpricing%3Fx%3D1',
    );
  });

  it('does nothing outside preview, in draft mode, or for posts', () => {
    expect(preprDraftRedirect(request('/'), { preview: false })).toBeNull();
    expect(
      preprDraftRedirect(request('/', '__prerender_bypass=1'), {
        preview: true,
      }),
    ).toBeNull();
    expect(
      preprDraftRedirect(request('/', '', 'POST'), { preview: true }),
    ).toBeNull();
  });

  it('serves the page when the browser refused the draft cookie, instead of looping', () => {
    expect(
      preprDraftRedirect(request('/pricing?prepr_draft=1'), { preview: true }),
    ).toBeNull();
  });

  it('drops the return marker once draft mode is on', () => {
    const response = preprDraftRedirect(
      request('/pricing?x=1&prepr_draft=1', '__prerender_bypass=1'),
      { preview: true },
    );
    expect(response?.headers.get('location')).toBe(
      'https://site.test/pricing?x=1',
    );
  });
});

describe('createPreprDraftRoute', () => {
  const GET = createPreprDraftRoute({ preview: true });
  const redirectOf = (url: string) =>
    GET(new Request(url)).catch((error: { to: string }) => error.to);

  it('enables draft mode and returns to the page', async () => {
    expect(
      await redirectOf('https://site.test/api/prepr/draft?to=%2Fpricing'),
    ).toBe('/pricing?prepr_draft=1');
    expect(enable).toHaveBeenCalled();
  });

  it('never redirects off-site', async () => {
    for (const to of ['https://evil.test/x', '//evil.test/x', '/\\evil.test']) {
      expect(
        await redirectOf(
          `https://site.test/api/prepr/draft?to=${encodeURIComponent(to)}`,
        ),
      ).toMatch(/^\/[^/\\]/);
    }
  });

  it('makes the draft cookie partitioned on https, for the editor iframe', async () => {
    await redirectOf('https://site.test/api/prepr/draft?to=%2F');
    expect(jar.set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '__prerender_bypass',
        value: 'id',
        partitioned: true,
        sameSite: 'none',
        secure: true,
      }),
    );
  });

  it('is a 404 outside preview', async () => {
    const response = await createPreprDraftRoute({ preview: false })(
      new Request('https://site.test/api/prepr/draft'),
    );
    expect(response.status).toBe(404);
  });
});
