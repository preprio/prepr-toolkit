import { ALL_FEATURES_ENABLED } from './features';
import type { Locale } from './i18n';
import type {
  PreprSegment,
  PreprVariant,
  ResolvedPreprFeatures,
} from './types';

/**
 * Everything the toolbar shows and the preview runtime acts on. Part of the
 * low-level toolbar API; a site that mounts the toolbar through
 * `createPreprPreview` or a framework component never touches it.
 */
export interface ToolbarState {
  locale: Locale;
  segments: PreprSegment[];
  selectedSegment: string | null;
  selectedVariant: PreprVariant | null;
  editMode: boolean;
  previewMode: boolean;
  toolbarOpen: boolean;
  isIframe: boolean;
  /**
   * Set once at construction, never patched. Lives here so the panel and the
   * element read it the same way they read everything else.
   */
  features: ResolvedPreprFeatures;
}

const DEFAULT_STATE: ToolbarState = {
  locale: 'en',
  segments: [],
  selectedSegment: null,
  selectedVariant: null,
  editMode: false,
  previewMode: false,
  toolbarOpen: false,
  isIframe: false,
  features: ALL_FEATURES_ENABLED,
};

/** Holds a `ToolbarState` and notifies subscribers of every change. */
export interface ToolbarStore {
  get(): ToolbarState;
  /** Merges `patch` into the state; subscribers run only on a real change. */
  set(patch: Partial<ToolbarState>): void;
  /** Returns a function that removes the subscription. */
  subscribe(fn: (s: ToolbarState) => void): () => void;
}

/**
 * Framework-free store for toolbar state. Deliberately pure: it holds state and
 * notifies subscribers, nothing else. Cookies, postMessage and reloads are side
 * effects owned by `createPreprPreview`.
 *
 * Low-level: only needed to drive a `PreprToolbarElement` by hand.
 * `createPreprPreview` creates and wires one for you.
 */
export function createToolbarStore(
  initial: Partial<ToolbarState> = {},
): ToolbarStore {
  let state: ToolbarState = { ...DEFAULT_STATE, ...initial };
  const listeners = new Set<(s: ToolbarState) => void>();

  function get(): ToolbarState {
    return state;
  }

  function set(patch: Partial<ToolbarState>): void {
    const keys = Object.keys(patch) as Array<keyof ToolbarState>;
    const hasChange = keys.some((key) => patch[key] !== state[key]);
    if (!hasChange) return;

    state = { ...state, ...patch };
    for (const listener of listeners) {
      listener(state);
    }
  }

  function subscribe(fn: (s: ToolbarState) => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }

  return { get, set, subscribe };
}
