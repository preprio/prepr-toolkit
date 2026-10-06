/**
 * Shows the A/B variant for the visitor's bucket (from the `prepr_ab_bucket`
 * cookie) and hides the others, by putting one rule in a constructable
 * stylesheet. A is the default.
 *
 * Self-contained on purpose: its source is also inlined as a `<script>` that
 * runs while the HTML is parsed, so it cannot use imports or outer
 * variables. It adds no DOM node, because React hydrates `<head>` and an
 * element it did not render there is a hydration error.
 */
export function applyPreprAbBucket(): void {
  const match = document.cookie.match(/(?:^|; )prepr_ab_bucket=([AB])(?:;|$)/);
  const bucket = match ? match[1] : 'A';
  const state = window as unknown as {
    __preprAbBucket?: string;
    __preprAbSheet?: CSSStyleSheet | HTMLStyleElement;
  };
  if (state.__preprAbBucket === bucket) return;
  state.__preprAbBucket = bucket;
  const css =
    bucket === 'A'
      ? ''
      : '[data-prepr-ab="A"]{display:none!important}[data-prepr-ab="' +
        bucket +
        '"]{display:contents!important}';
  try {
    if (!state.__preprAbSheet) {
      const sheet = new CSSStyleSheet();
      document.adoptedStyleSheets = document.adoptedStyleSheets.concat(sheet);
      state.__preprAbSheet = sheet;
    }
    (state.__preprAbSheet as CSSStyleSheet).replaceSync(css);
  } catch {
    // Browsers without constructable stylesheets.
    if (!state.__preprAbSheet) {
      state.__preprAbSheet = document.createElement('style');
      document.head.appendChild(state.__preprAbSheet);
    }
    (state.__preprAbSheet as HTMLStyleElement).textContent = css;
  }
}
