import { createScopedLogger } from '../utils';

const debug = createScopedLogger('stega:scroll');

/** How long the scrolled-to element keeps the highlight outline. */
const FLASH_DURATION_MS = 1200;

export interface ScrollToFieldRequest {
  /** Dot-separated field path, matching `data-prepr-field`. */
  field: string;
  /**
   * Content item id, matching `data-prepr-id`. Narrows the match when one page
   * renders the same field path for several items — a repeated card list.
   */
  id?: string;
}

let flashTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Scroll the element rendering a given Prepr field into view, for the editor
 * driving this preview: selecting a field in the CMS brings the matching
 * element on screen and outlines it.
 *
 * Finds the element by the `data-prepr-field` / `data-prepr-id` attributes the
 * stega scan writes, so it only ever matches encoded content — a field that is
 * not on the current page returns false rather than scrolling somewhere
 * arbitrary. Returns whether an element was found.
 */
export function scrollToField(request: ScrollToFieldRequest): boolean {
  const { field, id } = request;
  if (!field) return false;

  // The field path arrives over postMessage, so it never reaches a selector:
  // interpolating it would let a `"` close the attribute value and turn the
  // rest of the string into selector syntax, and CSS.escape covers
  // identifiers rather than quoted attribute values. Only the fixed
  // `[data-prepr-encoded]` part is a selector; the untrusted values are
  // compared as strings.
  const candidates = document.querySelectorAll<HTMLElement>(
    '[data-prepr-encoded]',
  );
  let target: HTMLElement | null = null;
  for (const candidate of candidates) {
    if (candidate.getAttribute('data-prepr-field') !== field) continue;
    if (id && candidate.getAttribute('data-prepr-id') !== id) continue;
    target = candidate;
    break;
  }

  if (!target) {
    debug.log('no element found for field', field);
    return false;
  }

  target.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Reuse the hover outline so the editor can see which element it landed on.
  if (flashTimeout) clearTimeout(flashTimeout);
  document
    .querySelectorAll('.prepr-overlay-active')
    .forEach((el) => el.classList.remove('prepr-overlay-active'));
  target.classList.add('prepr-overlay-active');
  flashTimeout = setTimeout(() => {
    target.classList.remove('prepr-overlay-active');
    flashTimeout = null;
  }, FLASH_DURATION_MS);

  return true;
}
