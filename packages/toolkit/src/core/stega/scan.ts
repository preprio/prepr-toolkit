import { createScopedLogger, throttle, type ThrottledFunction } from '../utils';
import { StegaElements } from './elements';
import { StegaOverlay, type StegaEditPayload } from './overlay';
import { StegaProximity } from './proximity';
import { injectStegaStyles, removeStegaStyles } from './styles';

const debug = createScopedLogger('stega:scan');

export interface StegaControllerOptions {
  onEdit: (payload: StegaEditPayload) => void;
  /**
   * Hover tooltip + overlay/proximity highlights, default true. Set false
   * inside the editor iframe: no chrome at all, encoded elements just get a
   * pointer cursor and clicking one fires `onEdit`.
   */
  tooltip?: boolean;
}

const EDITOR_MODE_STYLES = '[data-prepr-encoded]{cursor:pointer}';

export interface StegaController {
  start(): void;
  stop(): void;
}

/** Framework-agnostic orchestrator for the click-to-edit overlay system. */
export function createStegaController(
  opts: StegaControllerOptions
): StegaController {
  const tooltipEnabled = opts.tooltip ?? true;
  const overlay = new StegaOverlay(opts.onEdit);
  const proximity = new StegaProximity();
  const elements = new StegaElements();

  let initialized = false;
  let throttledMouseMove: ThrottledFunction<(e: Event) => void> | null = null;

  const handleTooltipMouseEnter = () => {
    overlay.clearHideTimeout();
  };

  const handleTooltipMouseLeave = () => {
    if (!overlay.hasCurrentElement()) {
      overlay.hide();
    }
  };

  const handleScroll = () => {
    overlay.hideImmediate();
    proximity.clearAllHighlights();
  };

  // editor mode only: the element itself is the click target
  const handleClick = (e: MouseEvent): void => {
    const target = e.target as HTMLElement | null;
    const encoded = target?.closest(
      '[data-prepr-encoded]'
    ) as HTMLElement | null;
    if (!encoded) return;
    e.preventDefault();
    e.stopPropagation();
    opts.onEdit({
      href: encoded.getAttribute('data-prepr-href') ?? '',
      origin: encoded.getAttribute('data-prepr-origin') ?? '',
      id: encoded.getAttribute('data-prepr-id') ?? undefined,
      field: encoded.getAttribute('data-prepr-field') ?? undefined,
    });
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
      debug.log('stega controller started (editor mode)');
      return;
    }

    injectStegaStyles();

    const { tooltip } = overlay.create();
    tooltip.addEventListener('mouseenter', handleTooltipMouseEnter);
    tooltip.addEventListener('mouseleave', handleTooltipMouseLeave);

    // reuse whatever the auto-clean pass already tagged
    elements.scanDocument(true);
    proximity.refreshObserving();
    elements.setupMutationObserver(() => proximity.refreshObserving());

    throttledMouseMove = throttle((e: Event) => {
      const mouseEvent = e as MouseEvent;
      const target = mouseEvent.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('.prepr-tooltip')) return;

      proximity.updateElementGradients(mouseEvent.clientX, mouseEvent.clientY);

      const encoded = target.closest('[data-prepr-encoded]');
      if (encoded) {
        overlay.show(encoded as HTMLElement);
      } else {
        overlay.hide();
      }
    }, 16);

    document.addEventListener('mousemove', throttledMouseMove);
    window.addEventListener('scroll', handleScroll, { capture: true });

    initialized = true;
    debug.log('stega controller started');
  };

  const stop = (): void => {
    if (!initialized) return;

    if (!tooltipEnabled) {
      document.removeEventListener('click', handleClick, { capture: true });
      elements.cleanup();
      removeStegaStyles();
      initialized = false;
      debug.log('stega controller stopped (editor mode)');
      return;
    }

    if (throttledMouseMove) {
      document.removeEventListener('mousemove', throttledMouseMove);
      throttledMouseMove.cancel();
      throttledMouseMove = null;
    }
    window.removeEventListener('scroll', handleScroll, { capture: true });

    const tooltip = overlay.getTooltip();
    if (tooltip) {
      tooltip.removeEventListener('mouseenter', handleTooltipMouseEnter);
      tooltip.removeEventListener('mouseleave', handleTooltipMouseLeave);
    }

    overlay.cleanup();
    proximity.clearAllHighlights();
    proximity.stopObserving();
    elements.cleanup();
    removeStegaStyles();

    initialized = false;
    debug.log('stega controller stopped');
  };

  return { start, stop };
}
