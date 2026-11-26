/**
 * Rich text from the editor links to items and assets by id
 * (`href="puuid#…"`, `href="auuid#…"`). The API serves those links as the
 * item's slug or the asset's URL, which the editor does not have. The page
 * does: it shows the stored text with its links already resolved.
 */

const INTERNAL_HREF = /^[pa]uuid#/;
// Part of every internal href: text without it holds no internal link, which
// is true of nearly every value an editor types.
const INTERNAL_MARK = 'uuid#';
const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
const HREF = /(\shref\s*=\s*)(["'])(.*?)\2/i;
const TAGS = /<[^>]+>/g;

// Pairing compares every pushed link with every page link. Text with more
// links than this allows shows its internal links as text until save, which
// bounds the time and memory one value can take.
const MAX_PAIRINGS = 250_000;

interface Anchor {
  /** Where the whole `<a …>…</a>` starts and ends in its string. */
  start: number;
  end: number;
  attributes: string;
  inner: string;
  href: string | null;
  /** The href is an item or asset id rather than a URL. */
  internal: boolean;
  text: string;
}

function anchorsIn(html: string): Anchor[] {
  const out: Anchor[] = [];
  for (const match of html.matchAll(ANCHOR)) {
    const attributes = match[1];
    const inner = match[2];
    const href = HREF.exec(attributes)?.[3] ?? null;
    out.push({
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      attributes,
      inner,
      href,
      internal: href !== null && INTERNAL_HREF.test(href),
      text: inner.replace(TAGS, '').trim(),
    });
  }
  return out;
}

/**
 * How well a pushed anchor fits one on the page. An internal link fits any
 * page link but one that is an id itself, since the page link is what the API
 * made of it; others fit only the same href. The same link text fits better.
 */
function fit(pushed: Anchor, page: Anchor): number {
  if (pushed.internal ? page.internal : pushed.href !== page.href) return 0;
  return pushed.text === page.text ? 2 : 1;
}

/**
 * For each pushed anchor, the page anchor it stands for, or -1. Aligns both
 * lists in order (links are added, removed and edited, not reordered), so a
 * link inserted before others leaves their pairing intact.
 */
function align(pushed: Anchor[], page: Anchor[]): number[] {
  const out = new Array<number>(pushed.length).fill(-1);
  if (!page.length || pushed.length * page.length > MAX_PAIRINGS) return out;
  // Best total fit of `pushed[i…]` with `page[j…]`, at `i * cols + j`.
  const cols = page.length + 1;
  const score = new Int32Array((pushed.length + 1) * cols);
  for (let i = pushed.length - 1; i >= 0; i--) {
    for (let j = page.length - 1; j >= 0; j--) {
      const at = i * cols + j;
      const pair = fit(pushed[i], page[j]);
      score[at] = Math.max(
        score[at + cols],
        score[at + 1],
        pair ? pair + score[at + cols + 1] : 0,
      );
    }
  }
  let i = 0;
  let j = 0;
  while (i < pushed.length && j < page.length) {
    const at = i * cols + j;
    const pair = fit(pushed[i], page[j]);
    if (pair && score[at] === pair + score[at + cols + 1]) {
      out[i++] = j++;
    } else if (score[at + cols] >= score[at + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return out;
}

/**
 * `value` with each internal link given the href the page already shows for
 * it. A link the page does not have yet (added since the last save) shows as
 * its text until save, as the API serves a link to an item without a slug.
 * Returns `value` itself when it holds no internal links.
 */
export function resolveInternalLinks(current: unknown, value: string): string {
  if (!value.includes(INTERNAL_MARK)) return value;
  const pushed = anchorsIn(value);
  if (!pushed.some((anchor) => anchor.internal)) return value;
  const page = typeof current === 'string' ? anchorsIn(current) : [];
  const pairs = align(pushed, page);

  let out = '';
  let cursor = 0;
  pushed.forEach((anchor, i) => {
    if (!anchor.internal) return;
    out += value.slice(cursor, anchor.start);
    const match = pairs[i] >= 0 ? page[pairs[i]] : null;
    if (match?.href != null) {
      const href = match.href;
      const attributes = anchor.attributes.replace(
        HREF,
        (_all, lead: string, quote: string) => `${lead}${quote}${href}${quote}`,
      );
      out += `<a${attributes}>${anchor.inner}</a>`;
    } else {
      out += anchor.inner;
    }
    cursor = anchor.end;
  });
  return out + value.slice(cursor);
}
