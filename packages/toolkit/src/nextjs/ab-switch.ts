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

/**
 * Shows the segment variant the proxy decided for each group rendered with
 * `aboveTheFold` (from the `prepr_decisions` cookie) and hides the others,
 * the same way as the A/B switch. Groups the cookie does not mention keep
 * their default variant.
 *
 * Applies once per page view (`view`, by default the current path and
 * query): the cookie also changes while a page is being read, through
 * background refreshes and prefetches, and those decisions are for the next
 * view. Showing them right away would swap content under the reader.
 *
 * Self-contained for the same reason as the A/B switch: its source is inlined
 * as a `<script>`. Only ids of letters, digits, `_` and `-` are used, so a
 * tampered cookie cannot inject CSS.
 */
export function applyPreprDecisions(view?: string): void {
  const viewState = window as unknown as { __preprDecisionsView?: string };
  const current =
    view === undefined ? location.pathname + location.search : view;
  if (viewState.__preprDecisionsView === current) return;
  viewState.__preprDecisionsView = current;
  const match = document.cookie.match(/(?:^|; )prepr_decisions=([^;]*)/);
  let raw: string;
  try {
    raw = match ? decodeURIComponent(match[1]!) : '';
  } catch {
    raw = '';
  }
  const state = window as unknown as {
    __preprDecisions?: string;
    __preprDecisionSheet?: CSSStyleSheet | HTMLStyleElement;
  };
  if (state.__preprDecisions === raw) return;
  state.__preprDecisions = raw;
  const id = /^[\w-]+$/;
  let css = '';
  raw.split('~').forEach((pair) => {
    const at = pair.indexOf(':');
    const group = pair.slice(0, at);
    if (at < 1 || !id.test(group)) return;
    const selector = '[data-prepr-group="' + group + '"]';
    css += selector + '{display:none!important}';
    pair
      .slice(at + 1)
      .split('|')
      .forEach((variant) => {
        if (id.test(variant)) {
          css +=
            selector +
            '[data-prepr-variant="' +
            variant +
            '"]{display:contents!important}';
        }
      });
  });
  try {
    if (!state.__preprDecisionSheet) {
      const sheet = new CSSStyleSheet();
      document.adoptedStyleSheets = document.adoptedStyleSheets.concat(sheet);
      state.__preprDecisionSheet = sheet;
    }
    (state.__preprDecisionSheet as CSSStyleSheet).replaceSync(css);
  } catch {
    // Browsers without constructable stylesheets.
    if (!state.__preprDecisionSheet) {
      state.__preprDecisionSheet = document.createElement('style');
      document.head.appendChild(state.__preprDecisionSheet);
    }
    (state.__preprDecisionSheet as HTMLStyleElement).textContent = css;
  }
}
