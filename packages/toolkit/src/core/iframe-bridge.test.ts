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

  it('accepts any single-label tenant subdomain', () => {
    for (const tenant of [
      'https://acme.prepr.io',
      'https://editor.prepr.io',
      'https://app.prepr.io',
      'https://customer-with-dashes.prepr.io',
    ]) {
      const s = createToolbarStore();
      const b = createIframeBridge(s);
      b.start();
      postFrom(tenant, { event: 'prepr:initVE' });
      expect(s.get().previewMode, `${tenant} must be trusted`).toBe(true);
      b.stop();
    }
  });

  it('rejects lookalike and nested origins', () => {
    for (const near of [
      // Suffix-match traps: all of these pass a naive endsWith/includes check.
      'https://editor.prepr.io.attacker.com',
      'https://evil-prepr.io',
      'https://preprio.io',
      'https://attacker.com/?x=https://acme.prepr.io',
      // The apex itself is not a tenant.
      'https://prepr.io',
      // Nested hosts — asset/CDN subdomains must never drive the toolbar.
      'https://foo.stream.prepr.io',
      'https://cdn.tracking.prepr.io',
      // Wrong scheme / non-default port.
      'http://acme.prepr.io',
      'https://acme.prepr.io:8080',
      // Opaque origin from a sandboxed frame.
      'null',
    ]) {
      const s = createToolbarStore();
      const b = createIframeBridge(s);
      b.start();
      postFrom(near, { event: 'prepr:initVE' });
      expect(s.get().previewMode, `${near} must not be trusted`).toBe(false);
      b.stop();
    }
  });

  it('an explicit allowlist replaces the wildcard entirely', () => {
    const s = createToolbarStore();
    const b = createIframeBridge(s, {
      allowedEditorOrigins: ['https://editor.internal'],
    });
    b.start();

    // A tenant origin that the wildcard would accept is now rejected.
    postFrom(EDITOR, { event: 'prepr:initVE' });
    expect(s.get().previewMode).toBe(false);

    postFrom('https://editor.internal', { event: 'prepr:initVE' });
    expect(s.get().previewMode).toBe(true);
    b.stop();
  });

  // The deliberate split: `features.editMode` gates the site's own
  // click-to-edit, not the CMS driving its own preview iframe.
  it('still activates edit mode when the site disabled its own edit mode', () => {
    const s = createToolbarStore({
      features: { segments: true, abTesting: true, editMode: false },
    });
    const b = createIframeBridge(s);
    b.start();

    postFrom(EDITOR, { event: 'prepr:initVE', editMode: true });

    expect(s.get().previewMode).toBe(true);
    expect(s.get().editMode).toBe(true);
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

describe('createIframeBridge — loaded payload', () => {
  /** Capture the same-window `prepr_preview_bar` events `start()` fans out. */
  function captureLoaded(store: ReturnType<typeof createToolbarStore> | null) {
    const seen: Array<Record<string, unknown>> = [];
    const onEvent = (e: Event): void => {
      seen.push((e as CustomEvent).detail as Record<string, unknown>);
    };
    window.addEventListener('prepr_preview_bar', onEvent);
    const bridge = createIframeBridge(store);
    bridge.start();
    bridge.stop();
    window.removeEventListener('prepr_preview_bar', onEvent);
    return seen.find(m => m.event === 'loaded');
  }

  it('reports the resolved feature flags so the editor can hide disabled UI', () => {
    const store = createToolbarStore({
      features: { segments: false, abTesting: true, editMode: false },
    });

    expect(captureLoaded(store)).toMatchObject({
      event: 'loaded',
      features: { segments: false, abTesting: true, editMode: false },
    });
  });

  it('defaults to every feature enabled', () => {
    expect(captureLoaded(createToolbarStore())).toMatchObject({
      features: { segments: true, abTesting: true, editMode: true },
    });
  });

  it('omits the flags entirely when there is no store', () => {
    const loaded = captureLoaded(null);

    expect(loaded).toBeDefined();
    expect(loaded).not.toHaveProperty('features');
  });
});
