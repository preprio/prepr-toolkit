// The A/B switch runs in the browser, so this suite uses the DOM environment.
import { createElement, type ReactNode } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
const navigation = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => {
    throw new Error('useSearchParams makes every route dynamic');
  },
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
}));

const { PreprStack } = await import('./stack');
const { PREPR_BUCKET_COOKIE } = await import('./bucket');
const { applyPreprAbBucket, applyPreprDecisions } = await import('./ab-switch');
const { PreprAbSwitch, PreprPersonalizationSwitch } =
  await import('./components');

// Decision requests a client render sends: none unless a test answers them.
const decisionRequests = vi.fn(
  async (_url: string, _init?: RequestInit) => new Response('*'),
);
vi.stubGlobal('fetch', decisionRequests);

const ctx = (kind: string, group: string, variant: string) => ({
  _preprContext: { kind, group_id: group, variant_id: variant },
});
// Static content and one A/B test; nothing segment-personalized, so the whole
// stack renders synchronously.
const items = [
  { id: 'intro' },
  { id: 'cta-a', ...ctx('AB_TEST', 'g-cta', 'A') },
  { id: 'cta-b', ...ctx('AB_TEST', 'g-cta', 'B') },
];
const render = (resolved: { id: string }[]): ReactNode =>
  resolved.map((item) => createElement('p', { key: item.id }, item.id));

function html(props: { bucket?: string } = {}) {
  return renderToString(
    createElement(PreprStack<{ id: string }>, {
      items,
      render,
      ...props,
    }),
  );
}

afterEach(() => {
  delete (window as { __preprAbBucket?: string }).__preprAbBucket;
  delete (window as { __preprAbSheet?: unknown }).__preprAbSheet;
  delete (window as { __preprDecision?: unknown }).__preprDecision;
  decisionRequests.mockClear();
  history.replaceState(null, '', '/');
  document.cookie = 'prepr_decisions=; max-age=0; path=/';
  document.adoptedStyleSheets = [];
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.cookie = 'prepr_ab_bucket=; max-age=0; path=/';
});

describe('PreprStack A/B switch', () => {
  it('renders both variants in wrappers, plus the base style and switch script', () => {
    const out = html();
    expect(out).toContain('<div data-prepr-ab="A"><p>cta-a</p></div>');
    expect(out).toContain('<div data-prepr-ab="B"><p>cta-b</p></div>');
    expect(out).toContain(
      '[data-prepr-ab]:not([data-prepr-ab="A"]){display:none}',
    );
    expect(out).toContain('<script>');
    expect(out).toContain('<p>intro</p>');
  });

  it('renders only the known bucket, without a script, when bucket is passed', () => {
    const out = html({ bucket: 'B' });
    expect(out).toContain('<p>cta-b</p>');
    expect(out).not.toContain('cta-a');
    expect(out).not.toContain('<script>');
  });

  it('shows B before paint for a bucket-B visitor, and leaves A as the default', () => {
    const script = /<script>([\s\S]*?)<\/script>/.exec(html())![1]!;
    const rules = () =>
      [
        ...(document.adoptedStyleSheets ?? []).flatMap((sheet) =>
          [...sheet.cssRules].map((rule) => rule.cssText),
        ),
        ...[...document.head.querySelectorAll('style')].map(
          (s) => s.textContent,
        ),
      ].join(' ');

    // No cookie: nothing added, the base style shows A.
    new Function(script)();
    expect(rules()).not.toContain('display: none');
    expect(rules()).not.toContain('display:none');

    document.cookie = 'prepr_ab_bucket=B; path=/';
    new Function(script)();
    const added = rules().replace(/\s/g, '');
    expect(added).toContain('[data-prepr-ab="A"]{display:none!important');
    expect(added).toContain('[data-prepr-ab="B"]{display:contents!important');

    // Several stacks on one page add the rule once.
    const before = rules();
    new Function(script)();
    expect(rules()).toBe(before);
  });

  it('reads the same cookie resolvePreprBucket writes', () => {
    expect(applyPreprAbBucket.toString()).toContain(`${PREPR_BUCKET_COOKIE}=`);
  });
});

describe('PreprStack trackVariants', () => {
  const tracked = (kind: string, group: string, variant: string) => ({
    _preprContext: {
      kind,
      group_id: group,
      variant_id: variant,
      variant_key: `key-${variant}`,
    },
  });
  const abItems = [
    { id: 'intro' },
    { id: 'cta-a', ...tracked('AB_TEST', 'g-cta', 'A') },
    { id: 'cta-b', ...tracked('AB_TEST', 'g-cta', 'B') },
  ];
  const section = (resolved: { id: string }[]): ReactNode =>
    resolved.map((item) => createElement('section', { key: item.id }, item.id));
  // The keys go on in the task after the commit.
  const nextTask = () =>
    act(() => new Promise<void>((resolve) => setTimeout(resolve)));

  it('is off by default: the markup stays as it was', () => {
    const out = renderToString(
      createElement(PreprStack<{ id: string }>, {
        items: abItems,
        render: section,
      }),
    );
    expect(out).toContain('<div data-prepr-ab="A"><section>cta-a</section>');
    expect(out).not.toContain('data-prepr-variant-key');
  });

  it('puts each variant key on its section once mounted, keeping the A/B wrapper', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(PreprStack<{ id: string }>, {
          items: abItems,
          render: section,
          trackVariants: true,
        }),
      );
    });
    await nextTask();

    const sections = [...container.querySelectorAll('section')];
    expect(
      sections.map((el) => [
        el.textContent,
        el.getAttribute('data-prepr-variant-key'),
        el.parentElement?.getAttribute('data-prepr-ab') ?? null,
      ]),
    ).toEqual([
      ['intro', null, null],
      ['cta-a', 'key-A', 'A'],
      ['cta-b', 'key-B', 'B'],
    ]);
    act(() => root.unmount());
  });

  it('tags every item of a variant that holds several', async () => {
    const items = [
      { id: 'business', ...tracked('PERSONALIZATION', 'g', 'ALL_OTHER_USERS') },
      { id: 'private', ...tracked('PERSONALIZATION', 'g', 'ALL_OTHER_USERS') },
    ];
    items[1]!._preprContext.variant_key = 'key-private';
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(PreprStack<{ id: string }>, {
          items,
          render: section,
          trackVariants: true,
        }),
      );
    });
    await nextTask();

    expect(
      [...container.querySelectorAll('section')].map((el) =>
        el.getAttribute('data-prepr-variant-key'),
      ),
    ).toEqual(['key-ALL_OTHER_USERS', 'key-private']);
    act(() => root.unmount());
  });

  // Prepr's pixel starts watching an element (its own IntersectionObserver and
  // Impression, no dedupe) once per mutation record that shows it a key: an
  // added subtree containing a keyed element, or the key attribute appearing.
  it('lets the pixel watch each variant once when it mounts on a client render', async () => {
    const watched = new Map<Element, number>();
    const watch = (el: Element) => watched.set(el, (watched.get(el) ?? 0) + 1);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') {
          watch(record.target as Element);
          continue;
        }
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.hasAttribute('data-prepr-variant-key')) watch(node);
          node.querySelectorAll('[data-prepr-variant-key]').forEach(watch);
        }
      }
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-prepr-variant-key'],
    });
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(PreprStack<{ id: string }>, {
          items: abItems,
          render: section,
          trackVariants: true,
        }),
      );
    });
    await nextTask();
    observer.disconnect();

    expect([...watched].map(([el, count]) => [el.textContent, count])).toEqual([
      ['cta-a', 1],
      ['cta-b', 1],
    ]);
    act(() => root.unmount());
  });
});

describe('PreprStack segment groups', () => {
  type Item = { id: string; logos?: { id: string }[] };
  const seg = (group: string, variant: string) =>
    ctx('PERSONALIZATION', group, variant);
  const hero = [
    { id: 'hero-default', ...seg('hero', 'ALL_OTHER_USERS') },
    { id: 'hero-dev', ...seg('hero', 'DEVELOPERS') },
  ];
  // A personalization item whose own stack holds the segment group, like a
  // logo strip that varies per segment.
  const logoStrip = (...variants: string[]): Item => ({
    id: 'logos',
    logos: variants.map((v) => ({ id: `logo-${v}`, ...seg('logos', v) })),
  });
  const renderItems = (resolved: Item[]): ReactNode =>
    resolved.map((item) =>
      createElement(
        'p',
        { key: item.id },
        [item.id, ...(item.logos ?? []).map((l) => l.id)].join(' '),
      ),
    );
  const stack = (stackItems: Item[]) =>
    createElement(PreprStack<Item>, { items: stackItems, render: renderItems });
  const shown = () =>
    [...document.querySelectorAll('[data-prepr-show]')].map(
      (el) => el.textContent,
    );
  // Loads a page the way the browser does: the proxy's cookie, then the HTML
  // with its inline decision calls.
  function load(path: string, cookie: string | null, stackItems: Item[]) {
    history.replaceState(null, '', path);
    if (cookie !== null) {
      document.cookie = `prepr_decisions=${encodeURIComponent(`${Date.now()}|${cookie}`)}; path=/`;
    }
    document.body.innerHTML = renderToString(stack(stackItems));
    applyPreprDecisions();
  }

  it('renders every variant in the page, hidden until decided: nothing streams', () => {
    const html = renderToString(stack([...hero, { id: 'outro' }]));
    expect(html).toContain(
      '<div data-prepr-v="hero:ALL_OTHER_USERS" data-prepr-default=""><p>hero-default</p></div>',
    );
    expect(html).toContain(
      '<div data-prepr-v="hero:DEVELOPERS"><p>hero-dev</p></div>',
    );
    expect(html).toContain('[data-prepr-v]{display:none}');
    expect(html).not.toContain('<!--$');
  });

  it('renders an item with a nested group once per variant, the default included', () => {
    const html = renderToString(stack([logoStrip('DEVELOPERS')]));
    expect(html).toContain(
      '<div data-prepr-v="logos:ALL_OTHER_USERS" data-prepr-default="" data-prepr-nested=""><p>logos</p></div>',
    );
    expect(html).toContain(
      '<div data-prepr-v="logos:DEVELOPERS" data-prepr-nested=""><p>logos logo-DEVELOPERS</p></div>',
    );
  });

  it('renders an item with several nested groups once per combination of their variants', () => {
    const item: Item & { quotes: object[] } = {
      ...logoStrip('ALL_OTHER_USERS', 'DEVELOPERS'),
      quotes: [{ id: 'q', ...seg('quotes', 'MARKETERS') }],
    };
    const html = renderToString(stack([item]));
    expect(html.match(/data-prepr-v="/g)).toHaveLength(4);
    expect(html).toContain('data-prepr-v="logos:DEVELOPERS quotes:MARKETERS"');
  });

  it("shows the proxy's decision for this URL before paint, and keeps it only until another page is viewed", () => {
    load('/solutions/astro-cms', '/solutions/astro-cms@hero:DEVELOPERS', hero);
    expect(shown()).toEqual(['hero-dev']);
    // A reload of this view may reuse it...
    expect(document.cookie).toContain('DEVELOPERS');
    // ...until a decision for another page applies.
    history.replaceState(null, '', '/pricing');
    applyPreprDecisions('hero:ALL_OTHER_USERS');
    expect(document.cookie).not.toContain('DEVELOPERS');
  });

  it('shows a page on Back as this tab last showed it, without asking again', async () => {
    const container = document.body.appendChild(document.createElement('div'));
    const root = createRoot(container);
    // Viewed /a with the Developers variant, then went to /b.
    history.replaceState(null, '', '/a');
    applyPreprDecisions('hero:DEVELOPERS');
    await act(async () => root.render(stack(hero)));
    history.pushState(null, '', '/b');
    applyPreprDecisions('hero:ALL_OTHER_USERS');
    await act(async () => root.render(stack([logoStrip('DEVELOPERS')])));
    decisionRequests.mockClear();

    history.replaceState(null, '', '/a');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await act(async () => root.render(stack(hero)));
    expect(shown()).toEqual(['hero-dev']);
    expect(decisionRequests).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('never shows a variant, not even the default, without a decision for this view', () => {
    load('/pricing', '/solutions/astro-cms@hero:DEVELOPERS', hero);
    expect(shown()).toEqual([]);
  });

  it('shows the defaults when Prepr could not be asked, and nothing for a group the decision leaves out', () => {
    load('/a', '/a@*', [...hero, logoStrip('DEVELOPERS')]);
    expect(shown()).toEqual(['hero-default', 'logos']);
    delete (window as { __preprDecision?: unknown }).__preprDecision;
    load('/b', '/b@logos:DEVELOPERS', [...hero, logoStrip('DEVELOPERS')]);
    expect(shown()).toEqual(['logos logo-DEVELOPERS']);
  });

  it('shows every decided variant of a group, but an item with a nested group only once', () => {
    load(
      '/c',
      '/c@hero:DEVELOPERS|ALL_OTHER_USERS~logos:MARKETERS|DEVELOPERS',
      [...hero, logoStrip('DEVELOPERS', 'MARKETERS')],
    );
    expect(shown()).toEqual([
      'hero-default',
      'hero-dev',
      'logos logo-MARKETERS',
    ]);
  });

  it('shows the defaults to visitors without JavaScript', () => {
    expect(renderToString(stack(hero))).toContain(
      '<noscript><style>[data-prepr-v][data-prepr-default]{display:contents}</style></noscript>',
    );
  });

  it('tells render which variant shows by default, so only that one preloads its images', () => {
    const seen: [string, boolean][] = [];
    renderToString(
      createElement(PreprStack<{ id: string }>, {
        items: [
          ...hero,
          { id: 'cta-a', ...ctx('AB_TEST', 'g-cta', 'A') },
          { id: 'cta-b', ...ctx('AB_TEST', 'g-cta', 'B') },
        ],
        render: (resolved, { defaultVariant }) => {
          for (const item of resolved) seen.push([item.id, defaultVariant]);
          return null;
        },
      }),
    );
    expect(seen).toEqual([
      ['hero-default', true],
      ['hero-dev', false],
      ['cta-a', true],
      ['cta-b', false],
    ]);
  });

  it('asks for a decision on a view that has none (back and forward), holding the sections until it arrives', async () => {
    history.replaceState(null, '', '/solutions/astro-cms');
    let answer!: (body: string) => void;
    decisionRequests.mockImplementationOnce(
      () =>
        new Promise((resolve) => (answer = (b) => resolve(new Response(b)))),
    );
    const container = document.body.appendChild(document.createElement('div'));
    const root = createRoot(container);
    await act(async () => root.render(stack([logoStrip('DEVELOPERS')])));
    expect(decisionRequests.mock.calls[0]![0]).toBe('/solutions/astro-cms');
    expect(shown()).toEqual([]);
    await act(async () => answer('logos:DEVELOPERS'));
    expect(shown()).toEqual(['logos logo-DEVELOPERS']);
    act(() => root.unmount());
  });

  it('a visitor who viewed /solutions/developers navigates to /solutions/astro-cms and sees the Developers variant, never the default first', async () => {
    history.replaceState(null, '', '/solutions/developers');
    let answer!: (body: string) => void;
    decisionRequests.mockImplementationOnce(
      () =>
        new Promise((resolve) => (answer = (b) => resolve(new Response(b)))),
    );
    // Every moment any wrapper is shown, from the click to the new page.
    const everShown = new Set<string>();
    const watcher = new MutationObserver(() => {
      for (const text of shown()) everShown.add(text ?? '');
    });
    watcher.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
    });

    const container = document.body.appendChild(document.createElement('div'));
    const root = createRoot(container);
    let navigations = 0;
    // Stands in for a Next.js `Link`: the router renders the next page.
    const link = createElement(
      'a',
      {
        href: '/solutions/astro-cms',
        onClick: (event: { preventDefault(): void }) => {
          event.preventDefault();
          navigations++;
          history.pushState(null, '', '/solutions/astro-cms');
          root.render(stack([logoStrip('DEVELOPERS', 'MARKETERS')]));
        },
      },
      'Astro CMS',
    );
    await act(async () =>
      root.render(
        createElement(
          'div',
          null,
          createElement(PreprPersonalizationSwitch),
          link,
        ),
      ),
    );
    const anchor = container.querySelector('a')!;

    await act(async () => {
      anchor.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0 }),
      );
      anchor.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    // Asked on press, for the page the link opens.
    const [url, init] = decisionRequests.mock.calls[0]!;
    expect(url).toBe('/solutions/astro-cms');
    expect(new Headers(init?.headers).get('Prepr-Decide')).toBe('1');
    // Held: the page does not change before the decision is in.
    expect(navigations).toBe(0);

    await act(async () => answer('logos:DEVELOPERS'));
    expect(navigations).toBe(1);
    expect(shown()).toEqual(['logos logo-DEVELOPERS']);
    watcher.disconnect();
    expect([...everShown]).toEqual(['logos logo-DEVELOPERS']);
    act(() => root.unmount());
  });

  it('lets a click through at once when its decision arrived during the press', async () => {
    history.replaceState(null, '', '/');
    const container = document.body.appendChild(document.createElement('div'));
    const root = createRoot(container);
    let navigations = 0;
    await act(async () =>
      root.render(
        createElement(
          'div',
          null,
          createElement(PreprPersonalizationSwitch),
          createElement('a', {
            href: '/pricing',
            onClick: (event: { preventDefault(): void }) => {
              event.preventDefault();
              navigations++;
            },
          }),
        ),
      ),
    );
    const anchor = container.querySelector('a')!;
    await act(async () => {
      anchor.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0 }),
      );
    });
    anchor.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    );
    expect(navigations).toBe(1);
    expect(decisionRequests).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it('leaves modifier clicks and other sites alone', async () => {
    const container = document.body.appendChild(document.createElement('div'));
    const root = createRoot(container);
    await act(async () =>
      root.render(
        createElement(
          'div',
          null,
          createElement(PreprPersonalizationSwitch),
          createElement('a', { href: '/pricing', id: 'local' }),
          createElement('a', { href: 'https://example.com/x', id: 'other' }),
        ),
      ),
    );
    const click = (id: string, init: MouseEventInit = {}) => {
      const event = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
        ...init,
      });
      container.querySelector(`#${id}`)!.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(click('local', { metaKey: true })).toBe(false);
    expect(click('other')).toBe(false);
    expect(decisionRequests).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('leaves segment decisions to the decision switch: the A/B switch only applies the bucket', async () => {
    history.replaceState(null, '', '/x');
    document.cookie = `prepr_decisions=${encodeURIComponent('/x@hero:DEVELOPERS')}; path=/`;
    const root = createRoot(document.createElement('div'));
    await act(() => root.render(createElement(PreprAbSwitch)));
    expect(document.cookie).toContain('prepr_decisions');
    act(() => root.unmount());
  });
});
