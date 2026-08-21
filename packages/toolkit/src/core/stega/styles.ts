/**
 * Page-level stega styles, deliberately outside the toolbar shadow DOM — the
 * overlay, tooltip and proximity highlight have to layer over host page
 * content.
 *
 * Do not edit `stega.generated.ts`: it is LightningCSS output from
 * `./stega.css` via `scripts/compile-css.mjs`. Edit the CSS, run `pnpm
 * gen:css`.
 */
import { STEGA_STYLES } from './stega.generated';

export const STEGA_STYLE_MARKER = 'data-prepr-stega';

export { STEGA_STYLES };

/**
 * Idempotent: a second call reuses the existing tag, so passing a different
 * `css` (e.g. the editor iframe's cursor-only sheet) after the first inject is
 * a no-op.
 */
export function injectStegaStyles(
  css: string = STEGA_STYLES,
): HTMLStyleElement {
  const existing = document.querySelector<HTMLStyleElement>(
    `style[${STEGA_STYLE_MARKER}]`,
  );
  if (existing) return existing;

  const style = document.createElement('style');
  style.setAttribute(STEGA_STYLE_MARKER, '');
  style.textContent = css;
  document.head.appendChild(style);
  return style;
}

export function removeStegaStyles(): void {
  document
    .querySelectorAll(`style[${STEGA_STYLE_MARKER}]`)
    .forEach((node) => node.parentNode?.removeChild(node));
}
