import { describe, expect, it, vi } from 'vitest';

import { PARAM_SEGMENT, PARAM_VARIANT } from './constants';
import { createChangeHandler } from './toolbar-change-handler';
import { createToolbarStore, type ToolbarState } from './store';

function setup(path: string) {
  const store = createToolbarStore();
  const navigate = vi.fn();
  const handle = createChangeHandler({
    store,
    navigate,
    currentPath: () => path,
    reload: vi.fn(),
    stega: { start: vi.fn(), stop: vi.fn() },
    syncAutoClean: vi.fn(),
  });
  return { handle, navigate };
}

const base: ToolbarState = {
  locale: 'en',
  segments: [],
  selectedSegment: null,
  selectedVariant: null,
  editMode: false,
  previewMode: true,
  toolbarOpen: false,
  isIframe: false,
};

describe('createChangeHandler', () => {
  it('clears segment and variant params in a single navigate', () => {
    const { handle, navigate } = setup(
      `/blog?${PARAM_SEGMENT}=cats&${PARAM_VARIANT}=B&keep=1`
    );

    handle(
      { ...base, selectedSegment: 'cats', selectedVariant: 'B' },
      { ...base, selectedSegment: null, selectedVariant: 'A' }
    );

    expect(navigate).toHaveBeenCalledTimes(1);
    const url = new URL(navigate.mock.calls[0][0], 'https://x.test');
    expect(url.searchParams.get(PARAM_SEGMENT)).toBeNull();
    expect(url.searchParams.get(PARAM_VARIANT)).toBe('A');
    expect(url.searchParams.get('keep')).toBe('1');
  });

  it('does not navigate when neither segment nor variant changed', () => {
    const { handle, navigate } = setup('/blog');
    handle(base, { ...base, toolbarOpen: true });
    expect(navigate).not.toHaveBeenCalled();
  });
});
