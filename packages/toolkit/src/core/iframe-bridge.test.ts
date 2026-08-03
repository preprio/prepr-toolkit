import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createIframeBridge } from './iframe-bridge';
import { createToolbarStore } from './store';

/** Deliver a message event as if it came from `origin`. */
function postFrom(origin: string, data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data, origin }));
}

const EDITOR = 'https://editor.prepr.io';
const ATTACKER = 'https://evil.example.com';

describe('createIframeBridge — editor origin validation', () => {
  let bridge: ReturnType<typeof createIframeBridge>;
  let store: ReturnType<typeof createToolbarStore>;

  beforeEach(() => {
    store = createToolbarStore();
    bridge = createIframeBridge(store);
    bridge.start();
  });

  afterEach(() => {
    bridge.stop();
  });

  it('accepts the handshake from an allowlisted editor origin', () => {
    postFrom(EDITOR, { event: 'prepr:initVE', editMode: true });

    expect(store.get().previewMode).toBe(true);
    expect(store.get().editMode).toBe(true);
  });

  it('ignores the handshake from a non-allowlisted origin', () => {
    postFrom(ATTACKER, { event: 'prepr:initVE', editMode: true });

    expect(store.get().previewMode).toBe(false);
  });

  it('does not let an attacker win the race and become the trusted parent', () => {
    // Attacker posts first, before the real editor.
    postFrom(ATTACKER, { event: 'prepr:initVE', editMode: true });
    expect(store.get().previewMode).toBe(false);

    // The genuine editor still completes the handshake afterwards.
    postFrom(EDITOR, { event: 'prepr:initVE', editMode: true });
    expect(store.get().previewMode).toBe(true);
  });

  it('rejects origins that merely contain an allowlisted origin', () => {
    for (const near of [
      'https://editor.prepr.io.attacker.com',
      'https://noteditor.prepr.io',
      'http://editor.prepr.io', // wrong scheme
      'https://editor.prepr.io:8080', // wrong port
    ]) {
      const s = createToolbarStore();
      const b = createIframeBridge(s);
      b.start();
      postFrom(near, { event: 'prepr:initVE' });
      expect(s.get().previewMode, `${near} must not be trusted`).toBe(false);
      b.stop();
    }
  });

  it('honours a custom allowlist for self-hosted editors', () => {
    const s = createToolbarStore();
    const b = createIframeBridge(s, {
      allowedEditorOrigins: ['https://editor.internal'],
    });
    b.start();

    postFrom(EDITOR, { event: 'prepr:initVE' });
    expect(s.get().previewMode).toBe(false);

    postFrom('https://editor.internal', { event: 'prepr:initVE' });
    expect(s.get().previewMode).toBe(true);
    b.stop();
  });

  it('does not reply to scroll requests from an untrusted origin', () => {
    const spy = vi.spyOn(window.parent, 'postMessage');
    postFrom(ATTACKER, { event: 'prepr:getScrollPosition' });

    expect(
      spy.mock.calls.some(
        ([msg]) =>
          (msg as { event?: string })?.event === 'getScrollPosition'
      )
    ).toBe(false);
    spy.mockRestore();
  });
});
