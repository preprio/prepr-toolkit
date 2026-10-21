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

const { syncPreprLiveLog } = vi.hoisted(() => ({
  syncPreprLiveLog: vi.fn(async (_log: unknown) => {}),
}));
vi.mock('./live-action', () => ({ syncPreprLiveLog }));

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

/** Lets the lazily loaded live preview runtime finish starting. */
async function liveStarted(): Promise<void> {
  await React.act(async () => {
    await vi.dynamicImportSettled();
  });
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
      <Heading page={{ _id: 'hero-1', heading: 'Hi' }} />,
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

  it('takes no changes inside an iframe until live preview is enabled', async () => {
    stubFramed();
    initLivePreview();
    const { container } = await render(
      <Heading page={{ _id: 'hero-1', heading: 'Hi' }} />,
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
    expect(container.querySelector('h1')?.textContent).toBe('Hi');
  });

  it('picks up a registration made before live preview started', async () => {
    stubFramed();
    const { container } = await render(
      <Heading page={{ _id: 'hero-1', heading: 'Hi' }} />,
    );
    initLivePreview({ enabled: true });
    await liveStarted();
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

  it('re-renders with pushed field values inside the editor iframe', async () => {
    stubFramed();
    initLivePreview({ enabled: true });
    await liveStarted();
    const { container } = await render(
      <Heading page={{ _id: 'hero-1', heading: 'Hi' }} />,
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
    initLivePreview({ enabled: true, fetcher });
    await liveStarted();
    const { container } = await render(
      <Heading page={{ _id: 'hero-1', heading: 'Hi' }} />,
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
    initLivePreview({ enabled: true });
    await liveStarted();
    const { unmount } = await render(
      <Heading page={{ _id: 'hero-1', heading: 'Hi' }} />,
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

describe('useLive after a server re-render', () => {
  beforeEach(() => resetLivePreviewForTests());
  afterEach(() => vi.unstubAllGlobals());

  it('keeps typed text when the server sends the stored content again', async () => {
    stubFramed();
    initLivePreview({ enabled: true });
    await liveStarted();
    const first = await render(
      <Heading page={{ _id: 'hero-1', heading: 'Stored' }} />,
    );
    await React.act(async () => {
      post({ event: 'prepr:initVE' });
      post({
        event: 'prepr:fieldChange',
        itemId: 'hero-1',
        field: 'heading',
        value: 'Typed',
      });
    });
    expect(first.container.textContent).toBe('Typed');
    await first.unmount();

    // The route re-renders on the server without the change, so the
    // component receives the stored value as a new payload.
    const second = await render(
      <Heading page={{ _id: 'hero-1', heading: 'Stored' }} />,
    );
    expect(second.container.textContent).toBe('Typed');
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
    initLivePreview({ enabled: true });
    await liveStarted();
    await render(<PreprRefresh enabled />);
    await liveStarted();

    await React.act(async () => {
      post({ event: 'prepr:initVE' });
      post({ event: 'prepr:itemChanged', itemId: 'any' });
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('does nothing unless enabled', async () => {
    vi.useFakeTimers();
    stubFramed();
    await render(<PreprRefresh />);
    await React.act(async () => {
      post({ event: 'prepr:initVE' });
      post({ event: 'prepr:itemChanged', itemId: 'any' });
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(refresh).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('does nothing outside the iframe', async () => {
    await render(<PreprRefresh enabled />);
    await liveStarted();
    post({ event: 'prepr:initVE' });
    post({ event: 'prepr:itemChanged', itemId: 'any' });
    await React.act(async () => {});
    expect(refresh).not.toHaveBeenCalled();
  });

  it('sends unsaved changes to the server once typing pauses', async () => {
    vi.useFakeTimers();
    stubFramed();
    syncPreprLiveLog.mockClear();
    await render(<PreprRefresh enabled />);
    await liveStarted();

    await React.act(async () => {
      post({ event: 'prepr:initVE' });
      for (const value of ['a', 'ab', 'abc']) {
        post({
          event: 'prepr:fieldChange',
          itemId: 'p',
          field: 'title',
          value,
        });
        await vi.advanceTimersByTimeAsync(50);
      }
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(syncPreprLiveLog).toHaveBeenCalledTimes(1);
    expect(syncPreprLiveLog).toHaveBeenCalledWith([
      { type: 'field', itemId: 'p', field: 'title', value: 'abc' },
    ]);
    vi.useRealTimers();
  });

  it('drops pending changes when the editor saves', async () => {
    vi.useFakeTimers();
    stubFramed();
    syncPreprLiveLog.mockClear();
    await render(<PreprRefresh enabled />);
    await liveStarted();

    await React.act(async () => {
      post({ event: 'prepr:initVE' });
      post({
        event: 'prepr:fieldChange',
        itemId: 'p',
        field: 'title',
        value: 'x',
      });
      post({ event: 'prepr:itemChanged', itemId: 'p' });
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(syncPreprLiveLog).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('ignores changes from a page that is not the Prepr editor', async () => {
    vi.useFakeTimers();
    stubFramed();
    syncPreprLiveLog.mockClear();
    await render(<PreprRefresh enabled />);
    await liveStarted();

    await React.act(async () => {
      post({ event: 'prepr:initVE' }, 'https://attacker.example');
      post(
        { event: 'prepr:fieldChange', itemId: 'p', field: 'title', value: 'x' },
        'https://attacker.example',
      );
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(syncPreprLiveLog).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
