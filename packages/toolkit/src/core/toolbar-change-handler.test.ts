import { describe, expect, it, vi } from 'vitest';

import { ALL_FEATURES_ENABLED, resolveFeatures } from './features';
import {
  COOKIE_SEGMENT,
  COOKIE_VARIANT,
  PARAM_SEGMENT,
  PARAM_VARIANT,
} from './constants';
import { createChangeHandler } from './toolbar-change-handler';
import { createToolbarStore, type ToolbarState } from './store';
import type { PreprFeatures } from './types';

function setup(path: string, features?: PreprFeatures) {
  const store = createToolbarStore();
  const navigate = vi.fn();
  const stega = { start: vi.fn(), stop: vi.fn() };
  const resolved = resolveFeatures(features);
  const handle = createChangeHandler({
    store,
    features: resolved,
    editingEnabled: resolved.editMode,
    navigate,
    currentPath: () => path,
    reload: vi.fn(),
    stega,
  });
  return { handle, navigate, stega };
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
  features: ALL_FEATURES_ENABLED,
};

describe('createChangeHandler', () => {
  it('clears segment and variant params in a single navigate', () => {
    const { handle, navigate } = setup(
      `/blog?${PARAM_SEGMENT}=cats&${PARAM_VARIANT}=B&keep=1`,
    );

    handle(
      { ...base, selectedSegment: 'cats', selectedVariant: 'B' },
      { ...base, selectedSegment: null, selectedVariant: 'A' },
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

  describe('disabled features', () => {
    it('writes no segment cookie or param when segments are off', () => {
      const { handle, navigate } = setup('/blog', { segments: false });

      handle(base, { ...base, selectedSegment: 'cats' });

      expect(navigate).not.toHaveBeenCalled();
      expect(document.cookie).not.toContain(`${COOKIE_SEGMENT}=cats`);
    });

    it('writes no variant cookie or param when abTesting is off', () => {
      const { handle, navigate } = setup('/blog', { abTesting: false });

      handle(base, { ...base, selectedVariant: 'B' });

      expect(navigate).not.toHaveBeenCalled();
      expect(document.cookie).not.toContain(`${COOKIE_VARIANT}=B`);
    });

    it('still writes the enabled feature when the other is off', () => {
      const { handle, navigate } = setup('/blog', { segments: false });

      handle(base, { ...base, selectedSegment: 'cats', selectedVariant: 'B' });

      expect(navigate).toHaveBeenCalledTimes(1);
      const url = new URL(navigate.mock.calls[0][0], 'https://x.test');
      expect(url.searchParams.get(PARAM_SEGMENT)).toBeNull();
      expect(url.searchParams.get(PARAM_VARIANT)).toBe('B');
    });

    it('does not start the stega overlay when edit mode is off', () => {
      const { handle, stega } = setup('/blog', { editMode: false });

      handle(base, { ...base, editMode: true });

      expect(stega.start).not.toHaveBeenCalled();
    });

    it('starts the stega overlay when edit mode is on', () => {
      const { handle, stega } = setup('/blog');

      handle(base, { ...base, editMode: true });

      expect(stega.start).toHaveBeenCalledTimes(1);
    });
  });
});
