/**
 * Shows, of the personalization variant wrappers `PreprStack` rendered, the
 * ones this page view's decision picks, and keeps the rest hidden. Each
 * wrapper lists the `group:variant` pairs it renders; it shows when every
 * pair is chosen. A group the decision does not name shows nothing, and so
 * does every wrapper while no decision for this view is in: the default
 * variant never stands in for a decision that is still on its way.
 *
 * `decision` is the decision for the current URL: the answer to this page
 * load's decision request, a link's, or the one this tab showed before on
 * Back and Forward. Without it, the one already applied to this URL is used.
 * Returns false when there is no decision for this view yet.
 *
 * `refresh` marks a newer decision for a view that already shows one: a group
 * the visitor can see, or has scrolled past, keeps its variant, and only
 * groups still below the screen change. Swapping a section in view would
 * replace content the visitor is reading and move the page under them.
 *
 * Self-contained: its source is inlined as a `<script>` that runs while the
 * HTML is parsed, so it cannot use imports or outer variables. Ids are only
 * compared, never put into selectors.
 */
export function applyPreprDecisions(
  decision?: string,
  options: { refresh?: boolean } = {},
): boolean {
  const state = window as unknown as {
    __preprDecision?: { key: string; value: string };
  };
  const key = location.pathname + location.search;
  const previous = state.__preprDecision;
  let value = decision;
  if (
    value !== undefined &&
    value !== '*' &&
    options.refresh &&
    previous &&
    previous.key === key &&
    previous.value !== '*'
  ) {
    const pairs = (from: string) => {
      const out: Record<string, string> = {};
      from.split('~').forEach((pair) => {
        const colon = pair.indexOf(':');
        if (colon > 0) out[pair.slice(0, colon)] = pair;
      });
      return out;
    };
    const before = pairs(previous.value);
    const after = pairs(value);
    // A group showing a variant that is not wholly below the screen keeps
    // it. The wrapper takes no box (`display: contents`); its content does.
    document
      .querySelectorAll('[data-prepr-v][data-prepr-show]')
      .forEach((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        if (range.getBoundingClientRect().top >= window.innerHeight) return;
        (element.getAttribute('data-prepr-v') || '')
          .split(' ')
          .forEach((token) => {
            const group = token.slice(0, token.indexOf(':'));
            if (before[group]) after[group] = before[group];
          });
      });
    // Stored merged, so a later apply (a re-render) keeps what is in view.
    value = Object.keys(after)
      .map((group) => after[group])
      .join('~');
  }
  if (value !== undefined) state.__preprDecision = { key, value };
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
 * Asks the proxy for the decision of the view at `key` (path and query), or
 * answers from the visitor's recent ones, kept in the `prepr_decisions` cookie
 * that `createPreprProxy` also writes when it decides a page load. `result` is set at once when an
 * earlier decision covers the view, so a caller can show it before the page
 * paints.
 *
 * - A decision under 10 seconds old is used as is: Prepr needs a few
 *   seconds to process a visitor's activity, so asking again sooner would
 *   mostly get the same answer.
 * - An older one, up to 30 minutes, is used at once while a new one is asked
 *   for in the background; `onChange` gets the new one when it differs.
 *   Applied with `refresh`, it changes only sections below the screen.
 *   Segment membership rarely changes between two views, so the visitor's
 *   last variant beats sections that stay hidden while Prepr answers.
 * - A page without personalization answers with no groups, which is used for
 *   an hour without asking again: links to it cost nothing. A view that
 *   renders personalization itself (`personalized`) ignores that answer, so
 *   a page that gained personalization since is asked at once.
 * - Requests for the same view in flight at once are sent once.
 *
 * Never rejects: any failure answers `*`, the default variants, which is
 * kept only for 10 seconds and never replaces a real decision.
 *
 * Self-contained: its source is also inlined as a `<script>` (see
 * {@link applyPreprDecisions}).
 */
export function requestPreprDecision(
  key: string,
  options: {
    /** Gets a newer decision that arrives in the background and differs. */
    onChange?: (decision: string) => void;
    /** The view at `key` renders personalization: a "no groups" answer is outdated. */
    personalized?: boolean;
  } = {},
): { result?: string; value: Promise<string> } {
  // Kept in step with the proxy's reading and writing of this cookie.
  const fresh = 10000;
  const keep = 1800000;
  const keepStatic = 3600000;
  const state = window as unknown as {
    __preprAsking?: Record<string, Promise<string>>;
  };
  const asking = (state.__preprAsking = state.__preprAsking || {});
  const read = (): Record<string, [string, number]> => {
    const all: Record<string, [string, number]> = {};
    try {
      const match = document.cookie.match(/(?:^|; )prepr_decisions=([^;]*)/);
      const parsed = match ? JSON.parse(decodeURIComponent(match[1]!)) : null;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        Object.keys(parsed).forEach((stored) => {
          const entry = parsed[stored];
          if (
            stored.charAt(0) === '/' &&
            Array.isArray(entry) &&
            typeof entry[0] === 'string' &&
            typeof entry[1] === 'number'
          )
            all[stored] = [entry[0], entry[1]];
        });
    } catch {
      // Malformed: nothing stored.
    }
    return all;
  };
  const usable = (entry: [string, number] | undefined, now: number) => {
    if (!entry) return false;
    const age = now - entry[1];
    return (
      age >= 0 &&
      age < (entry[0] === '*' ? fresh : entry[0] === '' ? keepStatic : keep)
    );
  };
  const store = (answer: string) => {
    const all = read();
    const now = Date.now();
    const kept = all[key];
    const entries = Object.keys(all)
      .filter((stored) => stored !== key && usable(all[stored], now))
      .map((stored) => [stored, all[stored]!] as [string, [string, number]]);
    entries.push([
      key,
      answer === '*' && kept && usable(kept, now) && kept[0] !== '*'
        ? kept
        : [answer, now],
    ]);
    entries.sort((a, b) => b[1][1] - a[1][1]);
    entries.length = Math.min(entries.length, 20);
    const encode = () => {
      const out: Record<string, [string, number]> = {};
      entries.forEach((entry) => {
        out[entry[0]] = entry[1];
      });
      return encodeURIComponent(JSON.stringify(out));
    };
    let value = encode();
    while (entries.length > 1 && value.length > 3000) {
      entries.pop();
      value = encode();
    }
    document.cookie =
      'prepr_decisions=' +
      value +
      '; path=/; max-age=3600; samesite=lax' +
      (location.protocol === 'https:' ? '; secure' : '');
  };
  const ask = (): Promise<string> => {
    if (!asking[key]) {
      asking[key] = fetch(key, {
        headers: { 'Prepr-Decide': '1' },
        cache: 'no-store',
        credentials: 'same-origin',
        // The proxy gives up on Prepr after its own `timeoutMs`; this only
        // covers a proxy that never answers.
        signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined,
      })
        .then((response) => (response.ok ? response.text() : '*'))
        .catch(() => '*')
        .then((answer) => {
          delete asking[key];
          try {
            store(answer);
          } catch {
            // Cookies unavailable: the next view asks again.
          }
          return answer;
        });
    }
    return asking[key];
  };
  const last = read()[key];
  if (
    last &&
    !(last[0] === '' && options.personalized) &&
    usable(last, Date.now())
  ) {
    const value = last[0];
    if (value !== '' && Date.now() - last[1] >= fresh) {
      ask().then((answer) => {
        if (answer !== '*' && answer !== value && options.onChange)
          options.onChange(answer);
      });
    }
    return { result: value, value: Promise.resolve(value) };
  }
  const pending: { result?: string; value: Promise<string> } = {
    value: ask(),
  };
  pending.value.then((answer) => {
    pending.result = answer;
  });
  return pending;
}

/**
 * Asks for this page load's decision as soon as the HTML is parsed this far,
 * through {@link requestPreprDecision}, so the request runs while the rest of
 * the page, its styles and scripts still load, and applies the answer through
 * `window.__preprApply`. The page itself never waits for Prepr.
 *
 * Self-contained like {@link applyPreprDecisions}: its source is inlined,
 * after `window.__preprRequest`.
 */
export function startPreprDecision(): void {
  const state = window as unknown as {
    __preprApply: typeof applyPreprDecisions;
    __preprRequest: typeof requestPreprDecision;
  };
  const key = location.pathname + location.search;
  const apply = (answer: string, refresh?: boolean) => {
    if (location.pathname + location.search === key)
      state.__preprApply(answer, { refresh });
  };
  const pending = state.__preprRequest(key, {
    onChange: (answer) => apply(answer, true),
    personalized: true,
  });
  if (pending.result !== undefined) apply(pending.result);
  else pending.value.then((answer) => apply(answer));
}
