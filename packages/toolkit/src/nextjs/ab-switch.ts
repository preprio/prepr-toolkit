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
 * Shows, of the personalization variant wrappers `PreprStack` rendered, the
 * ones this page view's decision picks, and keeps the rest hidden. Each
 * wrapper lists the `group:variant` pairs it renders; it shows when every
 * pair is chosen. A group the decision does not name shows nothing, and so
 * does every wrapper while no decision for this view is in: the default
 * variant never stands in for a decision that is still on its way.
 *
 * `decision` is the decision for the current URL (from a click's decision
 * request, or the one this tab showed before on Back and Forward). Without
 * it, the one already applied to this URL is used, or the one the proxy left
 * in the `prepr_decisions` cookie for this URL. The cookie lasts until the
 * visitor views another page: it is deleted as soon as a decision for another
 * URL applies, so only a reload of the same view can reuse it. Returns false
 * when there is no decision for this view.
 *
 * Self-contained for the same reason as the A/B switch: its source is inlined
 * as a `<script>`. Ids are only compared, never put into selectors.
 */
export function applyPreprDecisions(decision?: string): boolean {
  const state = window as unknown as {
    __preprDecision?: { key: string; value: string };
  };
  const key = location.pathname + location.search;
  if (decision !== undefined) state.__preprDecision = { key, value: decision };
  const match = document.cookie.match(/(?:^|; )prepr_decisions=([^;]*)/);
  let raw: string;
  try {
    raw = match ? decodeURIComponent(match[1]!) : '';
  } catch {
    raw = '';
  }
  // `<decided at>|<url>@<decision>`
  const at = raw.lastIndexOf('@');
  const stored = raw.slice(raw.indexOf('|') + 1, at < 0 ? 0 : at);
  let current = state.__preprDecision;
  if ((!current || current.key !== key) && at >= 0 && stored === key) {
    current = state.__preprDecision = { key, value: raw.slice(at + 1) };
  }
  if (match && stored !== key) {
    document.cookie = 'prepr_decisions=; max-age=0; path=/';
  }
  if (!current || current.key !== key) return false;
  // `*`: Prepr could not be asked, so every group shows its default variant
  // (Prepr's id for visitors outside every segment).
  const defaults = current.value === '*';
  const chosen: Record<string, string[]> = {};
  current.value.split('~').forEach((pair) => {
    const colon = pair.indexOf(':');
    if (colon > 0)
      chosen[pair.slice(0, colon)] = pair.slice(colon + 1).split('|');
  });
  document.querySelectorAll('[data-prepr-v]').forEach((element) => {
    // A nested group's wrappers each hold a whole item: only its first
    // variant shows, or the item would repeat.
    const nested = element.hasAttribute('data-prepr-nested');
    const show = (element.getAttribute('data-prepr-v') || '')
      .split(' ')
      .every((token) => {
        const colon = token.indexOf(':');
        const variant = token.slice(colon + 1);
        if (defaults) return variant === 'ALL_OTHER_USERS';
        const variants = chosen[token.slice(0, colon)];
        return (
          !!variants &&
          (nested ? variants[0] === variant : variants.indexOf(variant) >= 0)
        );
      });
    if (show) element.setAttribute('data-prepr-show', '');
    else element.removeAttribute('data-prepr-show');
  });
  return true;
}
