import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetPixelWarningForTests,
  loadTrackingPixel,
  setTrackingParam,
  trackEvent,
} from './pixel';

function getScriptTags(): HTMLScriptElement[] {
  return Array.from(document.getElementsByTagName('script'));
}

describe('loadTrackingPixel', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    delete window.prepr;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete window.prepr;
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('creates window.prepr as a queueing function with a queue array and a t timestamp', () => {
    const before = Date.now();
    loadTrackingPixel('ID-XXXXXXXX');
    const after = Date.now();

    expect(typeof window.prepr).toBe('function');
    expect(Array.isArray(window.prepr!.queue)).toBe(true);
    expect(window.prepr!.t).toBeGreaterThanOrEqual(before);
    expect(window.prepr!.t).toBeLessThanOrEqual(after);
  });

  it('queues ("init", id, config) then ("event", "pageload") in order', () => {
    loadTrackingPixel('ID-XXXXXXXX', { variantImpressionThreshold: 5 });

    const queue = window.prepr!.queue;
    expect(queue.length).toBe(2);
    expect(Array.from(queue[0] as unknown[])).toEqual([
      'init',
      'ID-XXXXXXXX',
      { variantImpressionThreshold: 5 },
    ]);
    expect(Array.from(queue[1] as unknown[])).toEqual(['event', 'pageload']);
  });

  it('queues ("init", id) without a third argument when no config is passed', () => {
    loadTrackingPixel('ID-XXXXXXXX');

    const queue = window.prepr!.queue;
    expect(Array.from(queue[0] as unknown[])).toEqual(['init', 'ID-XXXXXXXX']);
  });

  it('injects exactly one async script tag with the correct src prefix and daily cache-buster', () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const expectedBuster = Math.ceil(now / dayMs) * dayMs;

    vi.spyOn(Date, 'now').mockReturnValue(now);

    loadTrackingPixel('ID-XXXXXXXX');

    const scripts = getScriptTags().filter(s =>
      s.src.startsWith('https://cdn.tracking.prepr.io/js/prepr-v2.min.js')
    );
    expect(scripts.length).toBe(1);
    expect(scripts[0].async).toBe(true);
    expect(scripts[0].src).toBe(
      `https://cdn.tracking.prepr.io/js/prepr-v2.min.js?t=${expectedBuster}`
    );
  });

  it('is idempotent: a second call does not re-create window.prepr or inject another script', () => {
    loadTrackingPixel('ID-XXXXXXXX');
    const firstPrepr = window.prepr;
    const firstQueueLength = firstPrepr!.queue.length;

    loadTrackingPixel('ID-YYYYYYYY');

    expect(window.prepr).toBe(firstPrepr);
    expect(window.prepr!.queue.length).toBe(firstQueueLength);

    const scripts = getScriptTags().filter(s =>
      s.src.startsWith('https://cdn.tracking.prepr.io/js/prepr-v2.min.js')
    );
    expect(scripts.length).toBe(1);
  });
});

describe('trackEvent', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    delete window.prepr;
    vi.restoreAllMocks();
    __resetPixelWarningForTests();
  });

  afterEach(() => {
    delete window.prepr;
  });

  it('lands in the queue when called before/without loadTrackingPixel having installed the real pixel yet', () => {
    loadTrackingPixel('ID-XXXXXXXX');
    trackEvent('custom_event', { foo: 'bar' });

    const queue = window.prepr!.queue;
    const last = Array.from(queue[queue.length - 1] as unknown[]);
    expect(last).toEqual(['event', 'custom_event', { foo: 'bar' }]);
  });

  it('calls window.prepr(...) when a legacy snippet-installed pixel is already present', () => {
    const preprFn = vi.fn() as unknown as NonNullable<Window['prepr']>;
    preprFn.queue = [];
    preprFn.t = Date.now();
    window.prepr = preprFn;

    trackEvent('legacy_event', 'stringdata');

    expect(preprFn).toHaveBeenCalledWith('event', 'legacy_event', 'stringdata');
  });

  it('warns once and does not throw when no pixel is installed at all', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => trackEvent('no_pixel_event')).not.toThrow();
    expect(() => trackEvent('no_pixel_event_2')).not.toThrow();

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

describe('setTrackingParam', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    delete window.prepr;
    vi.restoreAllMocks();
    __resetPixelWarningForTests();
  });

  afterEach(() => {
    delete window.prepr;
  });

  it('calls window.prepr("param", key, value)', () => {
    loadTrackingPixel('ID-XXXXXXXX');
    setTrackingParam('utm_source', 'newsletter');

    const queue = window.prepr!.queue;
    const last = Array.from(queue[queue.length - 1] as unknown[]);
    expect(last).toEqual(['param', 'utm_source', 'newsletter']);
  });

  it('warns once and does not throw when no pixel is installed', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => setTrackingParam('utm_source', 'x')).not.toThrow();
    expect(() => setTrackingParam('utm_source', 'y')).not.toThrow();

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
