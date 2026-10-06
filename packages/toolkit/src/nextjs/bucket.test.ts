// @vitest-environment node
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PREPR_BUCKET_COOKIE, resolvePreprBucket } from './bucket';

const URL_ = 'https://graphql.prepr.io/t';

function request(cookie = '') {
  const req = new NextRequest('https://site.test/pricing');
  if (cookie) req.headers.set('cookie', cookie);
  return new NextRequest(req.url, { headers: req.headers });
}

afterEach(() => vi.unstubAllGlobals());

describe('resolvePreprBucket', () => {
  it("asks Prepr once, stores Prepr's bucket in a readable cookie", async () => {
    const fetch = vi.fn(
      async () =>
        new Response('{}', { headers: { 'x-prepr-customer-bucket': 'B' } }),
    );
    vi.stubGlobal('fetch', fetch);
    const response = NextResponse.next();

    const bucket = await resolvePreprBucket(
      request('__prepr_uid=c1'),
      response,
      { url: URL_ },
    );

    expect(bucket).toBe('B');
    expect(fetch).toHaveBeenCalledTimes(1);
    const cookie = response.cookies.get(PREPR_BUCKET_COOKIE);
    expect(cookie?.value).toBe('B');
    expect(cookie?.httpOnly).toBe(false);
  });

  it('skips the lookup when onlyIf says the page has no A/B test', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const response = NextResponse.next();

    const bucket = await resolvePreprBucket(
      request('__prepr_uid=c1'),
      response,
      {
        url: URL_,
        onlyIf: async () => false,
      },
    );

    expect(bucket).toBe('A');
    expect(fetch).not.toHaveBeenCalled();
    expect(response.cookies.get(PREPR_BUCKET_COOKIE)).toBeUndefined();
  });

  it('does not run onlyIf for a visitor who already has a bucket', async () => {
    const onlyIf = vi.fn(async () => true);

    const bucket = await resolvePreprBucket(
      request(`__prepr_uid=c1; ${PREPR_BUCKET_COOKIE}=B`),
      NextResponse.next(),
      { url: URL_, onlyIf },
    );

    expect(bucket).toBe('B');
    expect(onlyIf).not.toHaveBeenCalled();
  });
});
