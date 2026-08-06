import { describe, it, expect, afterEach, vi } from 'vitest';
import { createIframeBridge } from './iframe-bridge';

/** Deliver a message event as if it came from `origin`. */
function postFrom(origin: string, data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data, origin }));
}

const EDITOR = 'https://editor.prepr.io';
const ATTACKER = 'https://evil.example.com';

describe('iframe bridge without a store (scroll-only consumers)', () => {
  let stop: (() => void) | null = null;

  afterEach(() => {
    stop?.();
    stop = null;
    vi.restoreAllMocks();
  });

  it('restores scroll position with no store attached', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.useFakeTimers();

    const bridge = createIframeBridge(null);
    bridge.start();
    stop = () => bridge.stop();

    postFrom(EDITOR, { event: 'prepr:initVE', scrollPosition: 420 });
    vi.runAllTimers();

    expect(scrollTo).toHaveBeenCalledWith(0, 420);
    vi.useRealTimers();
  });

  it('still rejects untrusted origins with no store to guard', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.useFakeTimers();

    const bridge = createIframeBridge(null);
    bridge.start();
    stop = () => bridge.stop();

    postFrom(ATTACKER, { event: 'prepr:initVE', scrollPosition: 999 });
    vi.runAllTimers();

    expect(scrollTo).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('replies to getScrollPosition once the editor is trusted', () => {
    const post = vi.fn();
    vi.spyOn(window, 'parent', 'get').mockReturnValue({
      postMessage: post,
    } as unknown as Window);

    const bridge = createIframeBridge(null);
    bridge.start();
    stop = () => bridge.stop();

    postFrom(EDITOR, { event: 'prepr:initVE' });
    post.mockClear();

    Object.defineProperty(window, 'scrollY', {
      value: 137,
      configurable: true,
    });
    postFrom(EDITOR, { event: 'prepr:getScrollPosition' });

    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ value: 137 }),
      EDITOR,
    );
  });
});
