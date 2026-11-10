import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetSharedState } from './shared-state';

describe('shared state', () => {
  afterEach(() => {
    resetSharedState();
    vi.restoreAllMocks();
  });

  // Each entry point is bundled separately, so the toolbar and live preview
  // run from different copies of the same module on one page.
  it('is seen by every copy of the module on the page', async () => {
    const toolbarCopy = await import('./utils');
    vi.resetModules();
    const liveCopy = await import('./utils');
    expect(liveCopy).not.toBe(toolbarCopy);

    toolbarCopy.setTrustedParentOrigin('https://editor.prepr.io');

    expect(liveCopy.getTrustedParentOrigin()).toBe('https://editor.prepr.io');
  });

  it('turns on debug logging in every copy', async () => {
    const toolbarCopy = await import('./utils');
    vi.resetModules();
    const liveCopy = await import('./utils');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    liveCopy.createScopedLogger('live').log('before');
    toolbarCopy.initDebugLogger(true);
    liveCopy.createScopedLogger('live').log('after');

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('[Prepr][live] after');
  });
});
