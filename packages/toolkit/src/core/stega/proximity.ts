import { createElementCache, createScopedLogger } from '../utils';

const debug = createScopedLogger('stega:proximity');

/**
 * Radial gradient that follows the cursor across encoded elements within 150px
 * of it, driven by the `--cursor-x` / `--cursor-y` / `--gradient-size` custom
 * properties (see stega.css). An IntersectionObserver keeps the per-mousemove
 * candidate set down to elements actually in the viewport.
 */
export class StegaProximity {
  private highlighted = new Set<HTMLElement>();
  private visible = new Set<HTMLElement>();
  private observer: IntersectionObserver | null = null;
  private getEncodedElements = createElementCache<HTMLElement>(
    '[data-prepr-encoded]',
    200
  );

  /** Call after the encoded element set changes — rebuilds the observer. */
  refreshObserving(): void {
    try {
      if (typeof IntersectionObserver === 'undefined') return;

      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }

      this.visible = new Set<HTMLElement>();

      this.observer = new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            const el = entry.target as HTMLElement;
            if (entry.isIntersecting) {
              this.visible.add(el);
            } else {
              this.visible.delete(el);
            }
          });
        },
        { root: null, rootMargin: '0px', threshold: 0 }
      );

      const nodes = this.getEncodedElements();
      nodes.forEach(el => this.observer!.observe(el));
      debug.log('observing', nodes.length, 'encoded elements');
    } catch (error) {
      debug.log('error setting up IntersectionObserver', error as object);
    }
  }

  stopObserving(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
      this.visible.clear();
    }
  }

  updateElementGradients(cursorX: number, cursorY: number): void {
    const candidates =
      this.visible.size > 0
        ? Array.from(this.visible)
        : Array.from(this.getEncodedElements());

    const newHighlighted = new Set<HTMLElement>();

    candidates.forEach(element => {
      const rect = element.getBoundingClientRect();

      const distance = Math.min(
        Math.abs(cursorX - rect.left),
        Math.abs(cursorX - rect.right),
        Math.abs(cursorY - rect.top),
        Math.abs(cursorY - rect.bottom)
      );

      if (distance < 150) {
        const relativeX = cursorX - rect.left;
        const relativeY = cursorY - rect.top;

        element.style.setProperty('--cursor-x', `${relativeX}px`);
        element.style.setProperty('--cursor-y', `${relativeY}px`);

        const baseGradientSize = Math.max(
          150,
          Math.max(rect.width, rect.height) * 1.1
        );
        const distanceScale = Math.max(0, (400 - distance) / 400);
        const gradientSize = baseGradientSize * distanceScale;

        element.style.setProperty('--gradient-size', `${gradientSize}px`);
        element.classList.add('prepr-proximity-highlight');
        newHighlighted.add(element);
      } else {
        element.classList.remove('prepr-proximity-highlight');
      }
    });

    this.highlighted = newHighlighted;
  }

  clearAllHighlights(): void {
    this.highlighted.forEach(element =>
      element.classList.remove('prepr-proximity-highlight')
    );
    this.highlighted.clear();
  }
}
