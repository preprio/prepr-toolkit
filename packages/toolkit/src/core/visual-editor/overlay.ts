/**
 * The chrome of the in-editor visual editor: a hover box and a selected box,
 * each with a field label, drawn in a shadow root so the host page's CSS can
 * neither restyle nor be restyled by it.
 *
 * Boxes are `position: fixed` and moved with `transform`, so following an
 * element is a compositor-only update and gliding between elements is a CSS
 * transition. All layout reads happen in one animation frame per change.
 */

const HOST_TAG = 'prepr-visual-editor';

// While the page scrolls, the boxes must stay glued to their elements; a
// transition there reads as lag. Cleared this long after the last scroll.
const SCROLL_SETTLE_MS = 120;

// Room the label needs above a box before it flips inside it.
const LABEL_SPACE_PX = 22;

const BOX_PADDING_PX = 3;

// Where to hit-test a target for something drawn over it, as fractions of
// its box: the centre and four points inset from the corners.
const PROBE_POINTS: Array<[number, number]> = [
  [0.5, 0.5],
  [0.15, 0.2],
  [0.85, 0.2],
  [0.15, 0.8],
  [0.85, 0.8],
];

/**
 * Whether any probe point of `rect` that lies in the viewport hits `target`
 * (or something inside it). False when an open menu, modal or sticky bar
 * covers it, so its outline is not drawn on top of that layer. The overlay
 * itself has `pointer-events: none`, so hit-testing looks straight through
 * it.
 */
function isUncovered(target: HTMLElement, rect: DOMRect): boolean {
  const width = window.innerWidth;
  const height = window.innerHeight;
  let probed = false;
  for (const [fx, fy] of PROBE_POINTS) {
    const x = rect.left + rect.width * fx;
    const y = rect.top + rect.height * fy;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    probed = true;
    const hit = document.elementFromPoint(x, y);
    // No answer (no layout engine) is not evidence of a cover.
    if (!hit || hit === target || target.contains(hit)) return true;
  }
  // Entirely off screen: nothing to hide it behind.
  return !probed;
}

const STYLES = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147483646;
  contain: strict;
}
.box {
  position: absolute;
  top: 0;
  left: 0;
  box-sizing: border-box;
  border-radius: 6px;
  opacity: 0;
  will-change: transform, width, height;
  transition:
    transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
    width 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
    height 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 140ms ease;
}
.box[data-visible] { opacity: 1; }
.box[data-instant], :host([data-scrolling]) .box {
  transition: opacity 140ms ease;
}
.hover {
  border: 1.5px solid rgba(79, 70, 229, 0.9);
  background: rgba(79, 70, 229, 0.06);
}
.selected {
  border: 2px solid #4f46e5;
  box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.18);
}
.label {
  position: absolute;
  left: -2px;
  bottom: 100%;
  margin-bottom: 4px;
  padding: 3px 7px;
  border-radius: 5px;
  background: #4f46e5;
  color: #fff;
  font: 500 11px/1.3 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  letter-spacing: 0.01em;
  white-space: nowrap;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.25);
}
.hover .label { background: rgba(79, 70, 229, 0.92); }
.box[data-label-inside] .label {
  bottom: auto;
  top: 2px;
  left: 2px;
  margin: 0;
}
@media (prefers-reduced-motion: reduce) {
  .box { transition: opacity 80ms linear; }
}
`;

interface Box {
  root: HTMLDivElement;
  label: HTMLDivElement;
  target: HTMLElement | null;
}

export class VisualEditorOverlay {
  private host: HTMLElement | null = null;
  private hoverBox: Box | null = null;
  private selectedBox: Box | null = null;
  private frame: number | null = null;
  private scrollTimeout: ReturnType<typeof setTimeout> | null = null;
  private resizeObserver: ResizeObserver | null = null;

  mount(): void {
    if (this.host) return;
    const host = document.createElement(HOST_TAG);
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLES;
    shadow.appendChild(style);
    this.hoverBox = this.createBox(shadow, 'hover');
    this.selectedBox = this.createBox(shadow, 'selected');
    // On <html>, not <body>: a transformed or filtered body would become the
    // containing block for `position: fixed` and drag the boxes with it.
    document.documentElement.appendChild(host);
    this.host = host;

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.schedule());
    }
  }

  unmount(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
    this.frame = null;
    this.scrollTimeout = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.host?.remove();
    this.host = null;
    this.hoverBox = null;
    this.selectedBox = null;
  }

  getHoverTarget(): HTMLElement | null {
    return this.hoverBox?.target ?? null;
  }

  getSelectedTarget(): HTMLElement | null {
    return this.selectedBox?.target ?? null;
  }

  setHover(target: HTMLElement | null, label: string): void {
    this.retarget(this.hoverBox, target, label);
  }

  setSelected(target: HTMLElement | null, label: string): void {
    this.retarget(this.selectedBox, target, label);
  }

  /** Call on every scroll; positions follow in the next frame, untransitioned. */
  onScroll(): void {
    if (!this.host) return;
    this.host.setAttribute('data-scrolling', '');
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
    this.scrollTimeout = setTimeout(() => {
      this.host?.removeAttribute('data-scrolling');
      this.scrollTimeout = null;
    }, SCROLL_SETTLE_MS);
    this.schedule();
  }

  /** Re-measure both boxes in the next animation frame. */
  schedule(): void {
    if (this.frame !== null || !this.host) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.render();
    });
  }

  private createBox(shadow: ShadowRoot, kind: string): Box {
    const root = document.createElement('div');
    root.className = `box ${kind}`;
    const label = document.createElement('div');
    label.className = 'label';
    root.appendChild(label);
    shadow.appendChild(root);
    return { root, label, target: null };
  }

  private retarget(
    box: Box | null,
    target: HTMLElement | null,
    label: string,
  ): void {
    if (!box || box.target === target) return;
    const previous = box.target;
    if (previous) this.resizeObserver?.unobserve(previous);
    box.target = target;
    if (target) {
      this.resizeObserver?.observe(target);
      box.label.textContent = label;
      // Appearing from nothing should not slide in from wherever the box was
      // last parked; only moves between visible targets animate.
      if (!box.root.hasAttribute('data-visible')) {
        box.root.setAttribute('data-instant', '');
      }
    }
    this.schedule();
  }

  private render(): void {
    // Both reads before any write, so one frame costs one layout.
    const hover = this.hoverBox ? this.measure(this.hoverBox) : null;
    const selected = this.selectedBox ? this.measure(this.selectedBox) : null;
    if (this.hoverBox) this.paint(this.hoverBox, hover);
    if (this.selectedBox) this.paint(this.selectedBox, selected);
  }

  private measure(box: Box): DOMRect | null {
    const target = box.target;
    if (!target) return null;
    if (!target.isConnected) {
      box.target = null;
      return null;
    }
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    if (!isUncovered(target, rect)) return null;
    return rect;
  }

  private paint(box: Box, rect: DOMRect | null): void {
    const root = box.root;
    if (!rect) {
      root.removeAttribute('data-visible');
      return;
    }
    const x = rect.left - BOX_PADDING_PX;
    const y = rect.top - BOX_PADDING_PX;
    root.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    root.style.width = `${rect.width + BOX_PADDING_PX * 2}px`;
    root.style.height = `${rect.height + BOX_PADDING_PX * 2}px`;
    root.toggleAttribute('data-label-inside', y < LABEL_SPACE_PX);

    if (root.hasAttribute('data-instant')) {
      root.setAttribute('data-visible', '');
      // Commit the untransitioned position before re-enabling transitions.
      requestAnimationFrame(() => root.removeAttribute('data-instant'));
      return;
    }
    root.setAttribute('data-visible', '');
  }
}
