import { describe, expect, it, vi } from 'vitest';

import { sendPreprEvent, setTrustedParentOrigin } from './utils';

describe('sendPreprEvent', () => {
  it('dispatches a CustomEvent named prepr_preview_bar on window', () => {
    const listener = vi.fn();
    window.addEventListener('prepr_preview_bar', listener);

    sendPreprEvent('preview_mode_toggled', { editMode: true });

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toMatchObject({
      name: 'prepr_preview_bar',
      event: 'preview_mode_toggled',
      editMode: true,
    });

    window.removeEventListener('prepr_preview_bar', listener);
  });

  it('postMessages the parent at the trusted origin once the handshake ran', () => {
    const postMessageSpy = vi.fn();
    const fakeParent = { postMessage: postMessageSpy } as unknown as Window;
    const originalParent = window.parent;

    Object.defineProperty(window, 'parent', {
      value: fakeParent,
      configurable: true,
    });
    setTrustedParentOrigin('https://app.prepr.io');

    sendPreprEvent('segment_changed', { segment: 'abc' });

    expect(postMessageSpy).toHaveBeenCalledTimes(1);
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'prepr_preview_bar',
        event: 'segment_changed',
        segment: 'abc',
      }),
      'https://app.prepr.io',
    );

    setTrustedParentOrigin(null);
    Object.defineProperty(window, 'parent', {
      value: originalParent,
      configurable: true,
    });
  });

  it('drops payload events to the parent before the handshake', () => {
    const postMessageSpy = vi.fn();
    const fakeParent = { postMessage: postMessageSpy } as unknown as Window;
    const originalParent = window.parent;

    Object.defineProperty(window, 'parent', {
      value: fakeParent,
      configurable: true,
    });

    // No trusted origin yet — a framing page must not receive CMS payloads.
    sendPreprEvent('segment_changed', { segment: 'abc' });
    expect(postMessageSpy).not.toHaveBeenCalled();

    // The payload-free readiness ping is the one permitted exception.
    sendPreprEvent('loaded', undefined, { allowUntrustedTarget: true });
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'loaded' }),
      '*',
    );

    Object.defineProperty(window, 'parent', {
      value: originalParent,
      configurable: true,
    });
  });

  it('does not postMessage when parent is the same as window', () => {
    const postMessageSpy = vi.spyOn(window, 'postMessage');

    sendPreprEvent('loaded');

    expect(postMessageSpy).not.toHaveBeenCalled();

    postMessageSpy.mockRestore();
  });
});
