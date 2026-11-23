/**
 * Rich text from the editor links to items and assets by id
 * (`href="puuid#…"`, `href="auuid#…"`). The API serves those links as the
 * item's slug or the asset's URL, which the editor does not have. The page
 * does: it shows the stored text with its links already resolved.
 */

const INTERNAL_HREF = /^[pa]uuid#/;
const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
const HREF = /(\shref\s*=\s*)(["'])(.*?)\2/i;
const TAGS = /<[^>]+>/g;

interface Anchor {
  /** Where the whole `<a …>…</a>` starts and ends in its string. */
  start: number;
  end: number;
  attributes: string;
  inner: string;
  href: string | null;
  text: string;
}

function anchorsIn(html: string): Anchor[] {
  const out: Anchor[] = [];
  for (const match of html.matchAll(ANCHOR)) {
    const attributes = match[1];
    const inner = match[2];
    out.push({
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      attributes,
      inner,
      href: HREF.exec(attributes)?.[3] ?? null,
      text: inner.replace(TAGS, '').trim(),
    });
  }
  return out;
}

const isInternal = (anchor: Anchor): boolean =>
  anchor.href !== null && INTERNAL_HREF.test(anchor.href);

/**
 * How well a pushed anchor fits one on the page: an internal link fits any
 * page link, others only the same href. The same link text fits better.
 */
function fit(pushed: Anchor, page: Anchor): number {
  if (!isInternal(pushed) && pushed.href !== page.href) return 0;
  // The page link is what the API made of an internal one: an id never
  // survives as such.
  if (isInternal(pushed) && page.href !== null && INTERNAL_HREF.test(page.href))
    return 0;
  return pushed.text === page.text ? 2 : 1;
}

/**
 * For each pushed anchor, the page anchor it stands for, or -1. Aligns both
 * lists in order (links are added, removed and edited, not reordered), so a
 * link inserted before others leaves their pairing intact.
 */
function align(pushed: Anchor[], page: Anchor[]): number[] {
  const rows = pushed.length + 1;
  const cols = page.length + 1;
  const score: number[][] = Array.from({ length: rows }, () =>
    new Array<number>(cols).fill(0),
  );
  for (let i = pushed.length - 1; i >= 0; i--) {
    for (let j = page.length - 1; j >= 0; j--) {
      const pair = fit(pushed[i], page[j]);
      score[i][j] = Math.max(
        score[i + 1][j],
        score[i][j + 1],
        pair ? pair + score[i + 1][j + 1] : 0,
      );
    }
  }
  const out = new Array<number>(pushed.length).fill(-1);
  let i = 0;
  let j = 0;
  while (i < pushed.length && j < page.length) {
    const pair = fit(pushed[i], page[j]);
    if (pair && score[i][j] === pair + score[i + 1][j + 1]) {
      out[i++] = j++;
    } else if (score[i + 1][j] >= score[i][j + 1]) {
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
  const pushed = anchorsIn(value);
  if (!pushed.some(isInternal)) return value;
  const page = typeof current === 'string' ? anchorsIn(current) : [];
  const pairs = align(pushed, page);

  let out = '';
  let cursor = 0;
  pushed.forEach((anchor, i) => {
    if (!isInternal(anchor)) return;
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
