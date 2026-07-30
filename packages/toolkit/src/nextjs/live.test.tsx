/** @jsxImportSource react */
// The package-wide jsxImportSource is preact (toolbar UI); this file renders
// with react-dom, so it opts back into React's jsx-runtime.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  initLivePreview,
  PreprRefresh,
  resetLivePreviewForTests,
  useLive,
} from './live';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
  usePathname: () => '/',
}));

/** Pretend we're framed: `window.self !== window.top`. */
function stubFramed(): void {
  vi.stubGlobal('top', {} as Window);
}

function post(data: unknown, origin = 'https://editor.prepr.io'): void {
  window.dispatchEvent(new MessageEvent('message', { data, origin }));
}

async function render(ui: React.ReactElement) {
  const { default: ReactDOMClient } = await import('react-dom/client');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = ReactDOMClient.createRoot(container);
  await React.act(async () => root.render(ui));
  return {
    container,
    unmount: () => React.act(async () => root.unmount()),
  };
}

function Heading({ page }: { page: { _id: string; heading: string } }) {
  const live = useLive(page, { query: 'q', variables: {} });
  return <h1>{live.heading}</h1>;
}

describe('useLive', () => {
  beforeEach(() => {
    resetLivePreviewForTests();
    refresh.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns data untouched outside an iframe and ignores editor events', async () => {
    const { container } = await render(
      <Heading page={{ _id: 'hero-1', heading: 'Hi' }} />
    );
    post({ event: 'prepr:initVE' });
    post({
      event: 'prepr:fieldChange',
      itemId: 'hero-1',
      field: 'heading',
      value: 'Hello',
    });
    await React.act(async () => {});
    expect(container.querySelector('h1')?.textContent).toBe('Hi');
  });

  it('re-renders with pushed field values inside the editor iframe', async () => {
    stubFramed();
    initLivePreview();
    const { container } = await render(
      <Heading page={{ _id: 'hero-1', heading: 'Hi' }} />
    );

    await React.act(async () => {
      post({ event: 'prepr:initVE' });
      post({
        event: 'prepr:fieldChange',
        itemId: 'hero-1',
        field: 'heading',
        value: 'Hello',
      });
    });

    expect(container.querySelector('h1')?.textContent).toBe('Hello');
  });

  it('refetches via the configured fetcher on itemChanged', async () => {
    vi.useFakeTimers();
    stubFramed();
    const fetcher = vi
      .fn()
      .mockResolvedValue({ _id: 'hero-1', heading: 'Saved' });
    initLivePreview({ fetcher });
    const { container } = await render(
      <Heading page={{ _id: 'hero-1', heading: 'Hi' }} />
    );

    await React.act(async () => {
      post({ event: 'prepr:initVE' });
      post({ event: 'prepr:itemChanged', itemId: 'hero-1' });
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(fetcher).toHaveBeenCalledWith('q', {});
    expect(container.querySelector('h1')?.textContent).toBe('Saved');
    vi.useRealTimers();
  });

  it('stops updating after unmount', async () => {
    stubFramed();
    initLivePreview();
    const { unmount } = await render(
      <Heading page={{ _id: 'hero-1', heading: 'Hi' }} />
    );
    await unmount();
    // No assertion beyond "does not throw": unregistered listeners must not fire.
    post({ event: 'prepr:initVE' });
    post({
      event: 'prepr:fieldChange',
      itemId: 'hero-1',
      field: 'heading',
      value: 'x',
    });
  });
});

describe('PreprRefresh', () => {
  beforeEach(() => {
    resetLivePreviewForTests();
    refresh.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('calls router.refresh on itemChanged inside the iframe', async () => {
    vi.useFakeTimers();
    stubFramed();
    initLivePreview();
    await render(<PreprRefresh />);

    await React.act(async () => {
      post({ event: 'prepr:initVE' });
      post({ event: 'prepr:itemChanged', itemId: 'any' });
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('does nothing outside the iframe', async () => {
    await render(<PreprRefresh />);
    post({ event: 'prepr:initVE' });
    post({ event: 'prepr:itemChanged', itemId: 'any' });
    await React.act(async () => {});
    expect(refresh).not.toHaveBeenCalled();
  });
});
