/**
 * Shows, of the personalization variant wrappers `PreprStack` rendered, the
 * ones this page view's decision picks, and keeps the rest hidden. Each
 * wrapper lists the `group:variant` pairs it renders; it shows when every
 * pair is chosen. A group the decision does not name shows nothing, and so
 * does every wrapper while no decision for this view is in: the default
 * variant never stands in for a decision that is still on its way.
 *
 * `decision` is the decision for the current URL: the answer to this page
 * load's decision request, a click's, or the one this tab showed before on
 * Back and Forward. Without it, the one already applied to this URL is used.
 * Returns false when there is no decision for this view yet.
 *
 * Self-contained: its source is inlined as a `<script>` that runs while the
 * HTML is parsed, so it cannot use imports or outer variables. Ids are only
 * compared, never put into selectors.
 */
export function applyPreprDecisions(decision?: string): boolean {
  const state = window as unknown as {
    __preprDecision?: { key: string; value: string };
  };
  const key = location.pathname + location.search;
  if (decision !== undefined) state.__preprDecision = { key, value: decision };
  const current = state.__preprDecision;
  if (!current || current.key !== key) return false;
  // From now on wrappers no longer hold their default's space (see the stack's
  // base style): what shows is decided.
  document.querySelectorAll('[data-prepr-decision]').forEach((marker) => {
    marker.setAttribute('data-prepr-decided', '');
  });
  // `*`: Prepr could not be asked, so every group shows its default variant.
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
    const show = defaults
      ? element.hasAttribute('data-prepr-default')
      : (element.getAttribute('data-prepr-v') || '')
          .split(' ')
          .every((token) => {
            const colon = token.indexOf(':');
            const variant = token.slice(colon + 1);
            const variants = chosen[token.slice(0, colon)];
            return (
              !!variants &&
              (nested
                ? variants[0] === variant
                : variants.indexOf(variant) >= 0)
            );
          });
    if (show) element.setAttribute('data-prepr-show', '');
    else element.removeAttribute('data-prepr-show');
  });
  return true;
}

/**
 * Asks for this page load's decision as soon as the HTML is parsed this far,
 * so the request runs while the rest of the page, its styles and scripts
 * still load, and applies the answer through `window.__preprApply`. The page
 * itself never waits for Prepr.
 *
 * A reload of the same view within 10 seconds, with no other page view in
 * between, shows the decision it just had instead of asking again: Prepr
 * needs a few seconds to process a visitor's activity, so asking again
 * sooner would mostly get the same answer. Any failure answers `*`, the
 * default variants.
 *
 * Self-contained like {@link applyPreprDecisions}: its source is inlined.
 */
export function startPreprDecision(): void {
  const state = window as unknown as {
    __preprApply: (decision?: string) => boolean;
    __preprPending?: { key: string; value: Promise<string> };
  };
  const key = location.pathname + location.search;
  if (state.__preprPending && state.__preprPending.key === key) return;
  let last: { key?: string; value?: string; at?: number };
  try {
    last = JSON.parse(sessionStorage.getItem('prepr_decision') || '{}');
  } catch {
    last = {};
  }
  const age = Date.now() - (last.at || 0);
  const value: Promise<string> =
    last.key === key &&
    typeof last.value === 'string' &&
    age >= 0 &&
    age < 10000
      ? Promise.resolve(last.value)
      : fetch(key, {
          headers: { 'Prepr-Decide': '1' },
          cache: 'no-store',
          credentials: 'same-origin',
        })
          .then((response) => (response.ok ? response.text() : '*'))
          .catch(() => '*')
          .then((answer) => {
            try {
              sessionStorage.setItem(
                'prepr_decision',
                JSON.stringify({ key, value: answer, at: Date.now() }),
              );
            } catch {
              // Storage unavailable: a reload asks again.
            }
            return answer;
          });
  state.__preprPending = { key, value };
  value.then((answer) => {
    if (location.pathname + location.search === key) state.__preprApply(answer);
  });
}
