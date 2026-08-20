import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// React 19's act() warns unless the environment opts in explicitly.
declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('react components', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('../core/create-preview');
    vi.doUnmock('../core/pixel');
  });

  it('PreprPreview forwards props and destroys on unmount', async () => {
    const destroy = vi.fn();
    const createPreprPreview = vi.fn(() => ({ destroy }));
    vi.doMock('../core/create-preview', () => ({ createPreprPreview }));

    const React = await import('react');
    const { default: ReactDOMClient } = await import('react-dom/client');
    const { PreprPreview } = await import('./components');

    const props = { activeSegment: null, activeVariant: null, data: [] };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOMClient.createRoot(container);

    await React.act(async () => {
      root.render(React.createElement(PreprPreview, props));
    });

    expect(createPreprPreview).toHaveBeenCalledTimes(1);
    expect(createPreprPreview).toHaveBeenCalledWith(
      expect.objectContaining({ props })
    );

    await React.act(async () => {
      root.unmount();
    });
    expect(destroy).toHaveBeenCalledTimes(1);

    container.remove();
  });

  // The default adapter drives window.location, which is why `navigation` is
  // optional — omitting it must reach createPreprPreview as undefined rather
  // than as a half-built adapter.
  it('PreprPreview passes navigation through when given, undefined when not', async () => {
    const createPreprPreview = vi.fn(() => ({ destroy: vi.fn() }));
    vi.doMock('../core/create-preview', () => ({ createPreprPreview }));

    const React = await import('react');
    const { default: ReactDOMClient } = await import('react-dom/client');
    const { PreprPreview } = await import('./components');

    const navigation = {
      navigate: vi.fn(),
      currentPath: () => '/blog',
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOMClient.createRoot(container);

    await React.act(async () => {
      root.render(
        React.createElement(PreprPreview, {
          activeSegment: null,
          activeVariant: null,
          navigation,
        })
      );
    });

    expect(createPreprPreview).toHaveBeenCalledWith(
      expect.objectContaining({ navigation })
    );

    await React.act(async () => {
      root.unmount();
    });

    const bare = ReactDOMClient.createRoot(container);
    await React.act(async () => {
      bare.render(
        React.createElement(PreprPreview, {
          activeSegment: null,
          activeVariant: null,
        })
      );
    });

    expect(createPreprPreview).toHaveBeenLastCalledWith(
      expect.objectContaining({ navigation: undefined })
    );

    await React.act(async () => {
      bare.unmount();
    });
    container.remove();
  });

  // Preview-only setups (segments and A/B testing both off) have no server-
  // resolved segment or variant to pass. Requiring them forced consumers to
  // write `activeSegment={null} activeVariant={null}` as pure noise, so both
  // are optional — this pins that down at the type level and at runtime.
  it('PreprPreview mounts with neither activeSegment nor activeVariant', async () => {
    const destroy = vi.fn();
    const createPreprPreview = vi.fn(() => ({ destroy }));
    vi.doMock('../core/create-preview', () => ({ createPreprPreview }));

    const React = await import('react');
    const { default: ReactDOMClient } = await import('react-dom/client');
    const { PreprPreview } = await import('./components');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOMClient.createRoot(container);

    await React.act(async () => {
      root.render(
        React.createElement(PreprPreview, {
          options: { features: { segments: false, abTesting: false } },
        })
      );
    });

    expect(createPreprPreview).toHaveBeenCalledTimes(1);
    const [call] = createPreprPreview.mock.calls as unknown as [
      [{ props: Record<string, unknown> }],
    ];
    expect(call[0].props.activeSegment).toBeUndefined();
    expect(call[0].props.activeVariant).toBeUndefined();

    await React.act(async () => {
      root.unmount();
    });
    expect(destroy).toHaveBeenCalledTimes(1);
    container.remove();
  });

  it('PreprTrackingPixel calls loadTrackingPixel on effect, returns null', async () => {
    const loadTrackingPixel = vi.fn();
    vi.doMock('../core/pixel', () => ({ loadTrackingPixel }));

    const React = await import('react');
    const { default: ReactDOMClient } = await import('react-dom/client');
    const { PreprTrackingPixel } = await import('./components');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOMClient.createRoot(container);

    await React.act(async () => {
      root.render(React.createElement(PreprTrackingPixel, { id: 'abc123' }));
    });

    expect(loadTrackingPixel).toHaveBeenCalledWith('abc123', undefined);

    await React.act(async () => {
      root.unmount();
    });
    container.remove();
  });

  // The nextjs entry point re-exports this component; a break here is a break
  // for every existing `@preprio/toolkit/nextjs` consumer.
  it('nextjs re-export is the same component', async () => {
    const react = await import('./components');
    const nextjs = await import('../nextjs/components');

    expect(nextjs.PreprTrackingPixel).toBe(react.PreprTrackingPixel);
  });
});
