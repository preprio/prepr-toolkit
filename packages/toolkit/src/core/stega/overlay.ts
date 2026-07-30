import { createScopedLogger } from '../utils';
import type { StegaDecodedData } from './clean';

const debug = createScopedLogger('stega:overlay');

/** `id` + `field` are present only when the stega payload carried them. */
export interface StegaEditPayload extends StegaDecodedData {
  id?: string;
  field?: string;
}

/**
 * Floating outline + edit tooltip for the hovered encoded element. Clicks go
 * through `onEdit` rather than opening the edit URL directly, so the mount
 * controller can pick postMessage (inside the editor iframe) or window.open.
 */
export class StegaOverlay {
  private overlay: HTMLDivElement | null = null;
  private tooltip: HTMLDivElement | null = null;
  private hideTimeout: ReturnType<typeof setTimeout> | null = null;
  private currentElement: HTMLElement | null = null;
  private onEdit: (payload: StegaEditPayload) => void;

  constructor(onEdit: (payload: StegaEditPayload) => void) {
    this.onEdit = onEdit;
  }

  create(): { overlay: HTMLDivElement; tooltip: HTMLDivElement } {
    const overlay = document.createElement('div');
    overlay.className = 'prepr-overlay';
    overlay.style.display = 'none';

    const tooltip = document.createElement('div');
    tooltip.className = 'prepr-tooltip';
    tooltip.style.display = 'none';

    document.body.appendChild(overlay);
    document.body.appendChild(tooltip);

    this.overlay = overlay;
    this.tooltip = tooltip;
    return { overlay, tooltip };
  }

  getTooltip(): HTMLDivElement | null {
    return this.tooltip;
  }

  hasCurrentElement(): boolean {
    return this.currentElement !== null;
  }

  clearHideTimeout(): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }

  show(element: HTMLElement): void {
    if (!this.overlay || !this.tooltip) return;

    this.clearHideTimeout();

    if (this.currentElement && this.currentElement !== element) {
      this.currentElement.classList.remove('prepr-overlay-active');
    }

    const rect = element.getBoundingClientRect();
    const href = element.getAttribute('data-prepr-href');
    const origin = element.getAttribute('data-prepr-origin');
    const id = element.getAttribute('data-prepr-id') ?? undefined;
    const field = element.getAttribute('data-prepr-field') ?? undefined;

    debug.log('showing overlay', { href, origin });

    const overlay = this.overlay;
    overlay.style.display = 'block';
    overlay.style.top = `${rect.top + window.scrollY - 2}px`;
    overlay.style.left = `${rect.left + window.scrollX - 4}px`;
    overlay.style.width = `${rect.width + 8}px`;
    overlay.style.height = `${rect.height + 4}px`;

    const tooltip = this.tooltip;
    if (href && origin) {
      const MIN_WIDTH_FOR_TEXT = 80;
      const isCompact = rect.width < MIN_WIDTH_FOR_TEXT;
      tooltip.textContent = isCompact ? '↗' : `${origin} ↗`;
      tooltip.style.display = 'block';
      tooltip.style.minWidth = isCompact ? 'auto' : '80px';

      // clientWidth/Height are only meaningful after layout, so position on the
      // next frame; until then the clamping below would use stale zeros.
      requestAnimationFrame(() => {
        let top = rect.top + window.scrollY - tooltip.clientHeight - 2;
        let left = rect.right + 4 - tooltip.clientWidth;

        const minTop = window.scrollY + 4;
        const maxTop =
          window.scrollY + window.innerHeight - tooltip.clientHeight - 4;
        const minLeft = window.scrollX + 4;
        const maxLeft =
          window.scrollX + window.innerWidth - tooltip.clientWidth - 4;

        if (top < minTop) {
          top = rect.bottom + window.scrollY + 2;
        }
        top = Math.max(minTop, Math.min(top, maxTop));
        left = Math.max(minLeft, Math.min(left, maxLeft));

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
      });

      tooltip.onclick = () => {
        this.onEdit({ href, origin, id, field });
      };
    }

    this.currentElement = element;
    element.classList.add('prepr-overlay-active');
  }

  hideImmediate(): void {
    this.clearHideTimeout();

    if (this.overlay) this.overlay.style.display = 'none';
    if (this.tooltip) this.tooltip.style.display = 'none';
    if (this.currentElement) {
      this.currentElement.classList.remove('prepr-overlay-active');
      this.currentElement = null;
    }
  }

  hide(): void {
    if (!this.overlay || !this.tooltip) return;
    this.clearHideTimeout();
    this.hideTimeout = setTimeout(() => this.hideImmediate(), 100);
  }

  cleanup(): void {
    this.clearHideTimeout();

    if (this.overlay) {
      this.overlay.style.display = 'none';
      this.overlay.parentNode?.removeChild(this.overlay);
      this.overlay = null;
    }
    if (this.tooltip) {
      this.tooltip.style.display = 'none';
      this.tooltip.parentNode?.removeChild(this.tooltip);
      this.tooltip = null;
    }
    if (this.currentElement) {
      this.currentElement.classList.remove('prepr-overlay-active');
      this.currentElement = null;
    }
  }
}
