import { createScopedLogger } from '../utils';
import type { Locale } from '../i18n';
import { VisualEditorOverlay } from '../visual-editor/overlay';
import { fieldLabel } from '../visual-editor/field-path';
import { readEditPayload, type StegaEditPayload } from './dom';
import { StegaElements } from './elements';
import { injectStegaStyles, removeStegaStyles } from './styles';

const debug = createScopedLogger('stega:scan');

const ENCODED_SELECTOR = '[data-prepr-encoded]';

const PRESENCE_FADE_MS = 400;

export interface StegaControllerOptions {
  onEdit: (payload: StegaEditPayload) => void;
  /**
   * Edit-mode chrome, default true: a faint mark on every editable element
   * and a hover box whose label fires `onEdit`. Set false for a headless
   * preview: no chrome at all, encoded elements just get a pointer cursor and
   * clicking one fires `onEdit`.
   */
  tooltip?: boolean;
  /** Language of the hover label's fallback text. */
  locale?: Locale;
}

const EDITOR_MODE_STYLES = '[data-prepr-encoded]{cursor:pointer}';

export interface StegaController {
  start(): void;
  stop(): void;
}

/**
 * Fades the edit-mode marks in. Animated on the root rather than through the
 * stylesheet: a CSS `animation` on the marked elements would replace the
 * site's own animations on them, while a script animation composites with
 * them.
 */
function fadeInPresence(): void {
  const root = document.documentElement;
  if (typeof root.animate !== 'function') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  root.animate(
    { '--prepr-presence': ['0', '1'] },
    { duration: PRESENCE_FADE_MS, easing: 'ease-out' },
  );
}

/** Framework-agnostic orchestrator for the click-to-edit overlay system. */
export function createStegaController(
  opts: StegaControllerOptions,
): StegaController {
  const tooltipEnabled = opts.tooltip ?? true;
  const locale = opts.locale ?? 'en';
  const elements = new StegaElements();
  // The page's own clicks keep working in edit mode (links, menus, forms), so
  // only the label opens the editor.
  const overlay = new VisualEditorOverlay({
    onLabelClick: (target) => opts.onEdit(readEditPayload(target)),
  });

  let initialized = false;
  let pointerFrame: number | null = null;
  let pointerTarget: EventTarget | null = null;
  let pointerX = 0;
  let pointerY = 0;
  // Scrolling moves content under a resting pointer without a pointer event.
  let hitTestPending = false;

  const updateHover = (): void => {
    pointerFrame = null;
    if (hitTestPending) {
      hitTestPending = false;
      pointerTarget = document.elementFromPoint(pointerX, pointerY);
    }
    // The label sits outside its element; reaching it must not end the hover.
    if (overlay.owns(pointerTarget)) return;
    const encoded =
      pointerTarget instanceof Element
        ? pointerTarget.closest<HTMLElement>(ENCODED_SELECTOR)
        : null;
    overlay.setHover(
      encoded,
      encoded
        ? fieldLabel(encoded.getAttribute('data-prepr-field'), locale)
        : '',
    );
  };

  const scheduleHover = (): void => {
    if (pointerFrame === null) {
      pointerFrame = requestAnimationFrame(updateHover);
    }
  };

  // Also bound to pointerdown: a tap fires no pointermove, and is how a touch
  // visitor reveals the label.
  const handlePointer = (e: PointerEvent): void => {
    pointerTarget = e.target;
    pointerX = e.clientX;
    pointerY = e.clientY;
    hitTestPending = false;
    scheduleHover();
  };

  const handlePointerLeave = (): void => {
    pointerTarget = null;
    hitTestPending = false;
    overlay.setHover(null, '');
  };

  const handleScroll = (): void => {
    overlay.onScroll();
    if (pointerTarget === null) return;
    hitTestPending = true;
    scheduleHover();
  };

  const handleResize = (): void => overlay.schedule();

  // headless only: the element itself is the click target
  const handleClick = (e: MouseEvent): void => {
    const target = e.target as HTMLElement | null;
    const encoded = target?.closest<HTMLElement>(ENCODED_SELECTOR);
    if (!encoded) return;
    e.preventDefault();
    e.stopPropagation();
    opts.onEdit(readEditPayload(encoded));
  };

  const start = (): void => {
    if (initialized) {
      debug.log('already initialized, skipping setup');
      return;
    }

    if (!tooltipEnabled) {
      injectStegaStyles(EDITOR_MODE_STYLES);
      elements.scanDocument(true);
      elements.setupMutationObserver(() => {});
      document.addEventListener('click', handleClick, { capture: true });
      initialized = true;
      debug.log('stega controller started (headless)');
      return;
    }

    injectStegaStyles();
    fadeInPresence();
    overlay.mount();

    // reuse whatever the auto-clean pass already tagged
    elements.scanDocument(true);
    // Re-rendered content replaces the hovered element; re-resolve it.
    elements.setupMutationObserver(() => {
      if (pointerTarget === null) return;
      hitTestPending = true;
      scheduleHover();
    });

    // None of these call preventDefault, and the pointer and scroll ones fire
    // continuously on consumer pages: passive keeps them off the
    // compositor's critical path.
    document.addEventListener('pointermove', handlePointer, { passive: true });
    document.addEventListener('pointerdown', handlePointer, { passive: true });
    document.documentElement.addEventListener(
      'pointerleave',
      handlePointerLeave,
    );
    window.addEventListener('scroll', handleScroll, {
      capture: true,
      passive: true,
    });
    window.addEventListener('resize', handleResize, { passive: true });

    initialized = true;
    debug.log('stega controller started');
  };

  const stop = (): void => {
    if (!initialized) return;
    initialized = false;

    if (!tooltipEnabled) {
      document.removeEventListener('click', handleClick, { capture: true });
      elements.disconnect();
      removeStegaStyles();
      debug.log('stega controller stopped (headless)');
      return;
    }

    if (pointerFrame !== null) cancelAnimationFrame(pointerFrame);
    pointerFrame = null;
    pointerTarget = null;
    hitTestPending = false;
    document.removeEventListener('pointermove', handlePointer);
    document.removeEventListener('pointerdown', handlePointer);
    document.documentElement.removeEventListener(
      'pointerleave',
      handlePointerLeave,
    );
    window.removeEventListener('scroll', handleScroll, { capture: true });
    window.removeEventListener('resize', handleResize);

    overlay.unmount();
    elements.disconnect();
    removeStegaStyles();

    debug.log('stega controller stopped');
  };

  return { start, stop };
}
