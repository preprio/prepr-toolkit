import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLiveBridge } from './bridge-events';
import type { LiveStore } from './live-store';

function mockStore(): LiveStore {
  return {
    register: vi.fn(),
    pushPatch: vi.fn(),
    invalidate: vi.fn(),
    setFetcher: vi.fn(),
    onInvalidate: vi.fn(),
  } as unknown as LiveStore;
}

/** happy-dom delivers constructed MessageEvents synchronously. */
function post(data: unknown, origin = 'https://editor.prepr.io'): void {
  window.dispatchEvent(new MessageEvent('message', { data, origin }));
}

describe('createLiveBridge', () => {
  let store: LiveStore;
  let bridge: ReturnType<typeof createLiveBridge>;

  beforeEach(() => {
    store = mockStore();
    bridge = createLiveBridge(store);
    bridge.start();
  });
  afterEach(() => bridge.stop());

  it('ignores live events before the initVE handshake', () => {
    post({ event: 'prepr:fieldChange', itemId: 'a', field: 'f', value: 'v' });
    expect(store.pushPatch).not.toHaveBeenCalled();
  });

  it('routes fieldChange to pushPatch after handshake from the same origin', () => {
    post({ event: 'prepr:initVE' });
    post({ event: 'prepr:fieldChange', itemId: 'a', field: 'f', value: 'v' });
    expect(store.pushPatch).toHaveBeenCalledWith('a', 'f', 'v');
  });

  it('drops events from a different origin than the handshake', () => {
    post({ event: 'prepr:initVE' });
    post(
      { event: 'prepr:fieldChange', itemId: 'a', field: 'f', value: 'v' },
      'https://evil.example'
    );
    expect(store.pushPatch).not.toHaveBeenCalled();
  });

  it('routes itemChanged to invalidate', () => {
    post({ event: 'prepr:initVE' });
    post({ event: 'prepr:itemChanged', itemId: 'a' });
    expect(store.invalidate).toHaveBeenCalledWith('a');
  });

  it('drops malformed payloads', () => {
    post({ event: 'prepr:initVE' });
    post({ event: 'prepr:fieldChange', itemId: 42, field: 'f', value: 'v' });
    post({ event: 'prepr:fieldChange', itemId: 'a', field: 'f', value: {} });
    post({ event: 'prepr:itemChanged' });
    expect(store.pushPatch).not.toHaveBeenCalled();
    expect(store.invalidate).not.toHaveBeenCalled();
  });

  it('stop removes the listener', () => {
    post({ event: 'prepr:initVE' });
    bridge.stop();
    post({ event: 'prepr:fieldChange', itemId: 'a', field: 'f', value: 'v' });
    expect(store.pushPatch).not.toHaveBeenCalled();
  });
});
