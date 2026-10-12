import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPreprRefreshScheduler } from './refresh-scheduler';

const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));

function setRefreshCookie(at: number, paths: string[]) {
  // As Next.js writes it: the value URL-encoded.
  document.cookie = `prepr_refresh=${encodeURIComponent(`${at}~${paths.join('|')}`)}; path=/`;
}

function link(href: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = href;
  document.body.appendChild(a);
  return a;
}

const refreshes = () =>
  fetchMock.mock.calls.map((call) =>
    new Headers((call as unknown as [string, RequestInit])[1].headers).get(
      'Prepr-Refresh',
    ),
  );

beforeEach(() => {
  vi.useFakeTimers({ now: 1_000_000 });
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockClear();
  document.body.innerHTML = '';
});

afterEach(() => {
  document.cookie = 'prepr_refresh=; max-age=0; path=/';
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('createPreprRefreshScheduler', () => {
  it('refreshes about 3 s and 10 s after a view, and starts over on the next view', async () => {
    setRefreshCookie(Date.now(), ['/', '/pricing']);
    const scheduler = createPreprRefreshScheduler();

    scheduler.view();
    await vi.advanceTimersByTimeAsync(2_999);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(refreshes()).toEqual(['/|/pricing']);

    scheduler.view(); // the 10 s timer of the first view is dropped
    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(location.pathname);
    expect(init.cache).toBe('no-store');
    expect(init.credentials).toBe('same-origin');
    scheduler.stop();
  });

  it('does nothing without pages to refresh', async () => {
    const scheduler = createPreprRefreshScheduler();
    scheduler.view();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchMock).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it('refreshes on hover of a link to a personalized page once the decision is older than 2 s', async () => {
    setRefreshCookie(Date.now(), ['/']);
    const scheduler = createPreprRefreshScheduler();
    const home = link('/');
    const other = link('/blog');
    const away = link('https://elsewhere.test/');

    home.dispatchEvent(new Event('pointerover', { bubbles: true }));
    expect(fetchMock).not.toHaveBeenCalled(); // decided just now

    await vi.advanceTimersByTimeAsync(2_001);
    other.dispatchEvent(new Event('pointerover', { bubbles: true }));
    away.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(fetchMock).not.toHaveBeenCalled();

    home.dispatchEvent(new Event('touchstart', { bubbles: true }));
    expect(refreshes()).toEqual(['/']);
    scheduler.stop();
  });

  it('keeps one refresh in flight at a time', async () => {
    setRefreshCookie(1, ['/']);
    let finish = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(new Response(null, { status: 204 }));
        }),
    );
    const scheduler = createPreprRefreshScheduler();
    const home = link('/');

    home.dispatchEvent(new Event('pointerover', { bubbles: true }));
    home.dispatchEvent(new Event('pointerover', { bubbles: true }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    finish();
    await vi.advanceTimersByTimeAsync(0);
    home.dispatchEvent(new Event('pointerover', { bubbles: true }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('refreshes when the tab comes back after the decision went stale', async () => {
    setRefreshCookie(Date.now(), ['/']);
    const scheduler = createPreprRefreshScheduler({ freshFor: 10_000 });
    const visible = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('visible');

    document.dispatchEvent(new Event('visibilitychange'));
    expect(fetchMock).not.toHaveBeenCalled();

    vi.setSystemTime(Date.now() + 10_001);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    visible.mockRestore();
    scheduler.stop();
  });

  it('registers each listener once and removes it on stop', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const scheduler = createPreprRefreshScheduler();
    scheduler.view();
    scheduler.view();
    scheduler.stop();

    const added = add.mock.calls.map(([type, , options]) => [type, options]);
    expect(added).toEqual([
      ['pointerover', { capture: true, passive: true }],
      ['focusin', { capture: true, passive: true }],
      ['touchstart', { capture: true, passive: true }],
      ['visibilitychange', { passive: true }],
    ]);
    expect(remove).toHaveBeenCalledTimes(4);
    add.mockRestore();
    remove.mockRestore();
  });

  it('never throws on a hostile cookie or a failing network', async () => {
    document.cookie = 'prepr_refresh=%E0%A4%A; path=/';
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    const scheduler = createPreprRefreshScheduler();
    scheduler.view();
    await vi.advanceTimersByTimeAsync(20_000);
    setRefreshCookie(1, ['/']);
    link('/').dispatchEvent(new Event('pointerover', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });
});
