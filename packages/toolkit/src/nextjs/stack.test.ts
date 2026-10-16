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
const { applyPreprDecisions, requestPreprDecision, startPreprDecision } =
  await import('./decision-switch');
const { PreprPersonalizationSwitch } = await import('./components');

// Decision requests a client render sends: none unless a test answers them.
const decisionRequests = vi.fn(
  async (_url: string, _init?: RequestInit) => new Response('*'),
);
vi.stubGlobal('fetch', decisionRequests);

const ctx = (kind: string, group: string, variant: string) => ({
  _preprContext: { kind, group_id: group, variant_id: variant },
});
// Static content and one A/B test.
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
  delete (window as { __preprDecision?: unknown }).__preprDecision;
  delete (window as { __preprAsking?: unknown }).__preprAsking;
  sessionStorage.clear();
  decisionRequests.mockClear();
  history.replaceState(null, '', '/');
  document.cookie = 'prepr_decisions=; max-age=0; path=/';
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('PreprStack A/B tests', () => {
  const shown = () =>
    [...document.querySelectorAll('[data-prepr-show]')].map(
      (el) => el.textContent,
    );

  it('renders both variants hidden, picked by the same decision as segment groups', () => {
    const out = html();
    expect(out).toContain(
      '<div data-prepr-v="g-cta:A" data-prepr-default=""><p>cta-a</p></div>',
    );
    expect(out).toContain('<div data-prepr-v="g-cta:B"><p>cta-b</p></div>');
    expect(out).toContain('<p>intro</p>');

    history.replaceState(null, '', '/pricing');
    document.body.innerHTML = out;
    applyPreprDecisions('g-cta:B');
    expect(shown()).toEqual(['cta-b']);
  });

  it('shows A when Prepr could not be asked', () => {
    document.body.innerHTML = html();
    applyPreprDecisions('*');
    expect(shown()).toEqual(['cta-a']);
  });

  it('renders only the known bucket, with nothing to decide, when bucket is passed', () => {
    const out = html({ bucket: 'B' });
    expect(out).toContain('<p>cta-b</p>');
    expect(out).not.toContain('cta-a');
    expect(out).not.toContain('<script>');
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
    expect(out).toContain(
      '<div data-prepr-v="g-cta:A" data-prepr-default=""><section>cta-a</section>',
    );
    expect(out).not.toContain('data-prepr-variant-key');
  });

  it("puts the variant key on the shown variant's section once mounted, never on a hidden one", async () => {
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
        el.closest('[data-prepr-v]')?.getAttribute('data-prepr-v') ?? null,
      ]),
    ).toEqual([
      ['intro', null, null],
      ['cta-a', 'key-A', 'g-cta:A'],
      // Hidden: no impression for a variant the visitor does not get.
      ['cta-b', null, 'g-cta:B'],
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

  it("tags a section holding a personalized list with the shown variant's key", async () => {
    const strip = {
      id: 'logos',
      logos: [
        {
          id: 'logo-default',
          ...tracked('PERSONALIZATION', 'g', 'ALL_OTHER_USERS'),
        },
        { id: 'logo-dev', ...tracked('PERSONALIZATION', 'g', 'DEVELOPERS') },
      ],
    };
    history.replaceState(null, '', '/nested');
    applyPreprDecisions('g:DEVELOPERS');
    const container = document.body.appendChild(document.createElement('div'));
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(PreprStack<{ id: string }>, {
          items: [strip],
          render: section,
          trackVariants: true,
        }),
      );
    });
    await nextTask();

    expect(
      [...container.querySelectorAll('section')].map((el) => [
        el.closest('[data-prepr-v]')?.getAttribute('data-prepr-v'),
        el.getAttribute('data-prepr-variant-key'),
      ]),
    ).toEqual([
      ['g:ALL_OTHER_USERS', null],
      ['g:DEVELOPERS', 'key-DEVELOPERS'],
    ]);
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
  // A page with this view's decision applied (or none yet).
  function load(path: string, decision: string | null, stackItems: Item[]) {
    history.replaceState(null, '', path);
    document.body.innerHTML = renderToString(stack(stackItems));
    applyPreprDecisions(decision ?? undefined);
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

  it('asks for the decision while the page loads, and shows the variant when it answers', async () => {
    let answer!: (body: string) => void;
    decisionRequests.mockImplementationOnce(
      () =>
        new Promise((resolve) => (answer = (b) => resolve(new Response(b)))),
    );
    history.replaceState(null, '', '/solutions/astro-cms');
    document.body.innerHTML = renderToString(stack(hero));
    Object.assign(window, {
      __preprApply: applyPreprDecisions,
      __preprRequest: requestPreprDecision,
    });
    startPreprDecision();
    const [url, init] = decisionRequests.mock.calls[0]!;
    expect(url).toBe('/solutions/astro-cms');
    expect(new Headers(init?.headers).get('Prepr-Decide')).toBe('1');
    // Held, not the default, until the answer is in.
    expect(shown()).toEqual([]);
    answer('hero:DEVELOPERS');
    await new Promise((resolve) => setTimeout(resolve));
    expect(shown()).toEqual(['hero-dev']);
  });

  const storeDecision = (key: string, value: string, age: number) =>
    sessionStorage.setItem(
      'prepr_decisions',
      JSON.stringify({ [key]: { value, at: Date.now() - age } }),
    );

  it('shows a decision under 10 seconds old at once, without asking again', async () => {
    history.replaceState(null, '', '/x');
    Object.assign(window, {
      __preprApply: applyPreprDecisions,
      __preprRequest: requestPreprDecision,
    });
    document.body.innerHTML = renderToString(stack(hero));
    storeDecision('/x', 'hero:DEVELOPERS', 0);
    startPreprDecision();
    expect(shown()).toEqual(['hero-dev']);
    await new Promise((resolve) => setTimeout(resolve));
    expect(decisionRequests).not.toHaveBeenCalled();
  });

  it('shows an older decision at once and swaps in a different answer from the background', async () => {
    history.replaceState(null, '', '/x');
    Object.assign(window, {
      __preprApply: applyPreprDecisions,
      __preprRequest: requestPreprDecision,
    });
    document.body.innerHTML = renderToString(stack(hero));
    storeDecision('/x', 'hero:DEVELOPERS', 60_000);
    decisionRequests.mockResolvedValueOnce(
      new Response('hero:ALL_OTHER_USERS'),
    );
    startPreprDecision();
    expect(shown()).toEqual(['hero-dev']);
    expect(decisionRequests).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve));
    expect(shown()).toEqual(['hero-default']);
  });

  it('keeps showing the last decision when the background request fails', async () => {
    storeDecision('/x', 'hero:DEVELOPERS', 60_000);
    const onChange = vi.fn();
    expect(requestPreprDecision('/x', { onChange }).result).toBe(
      'hero:DEVELOPERS',
    );
    await new Promise((resolve) => setTimeout(resolve));
    expect(onChange).not.toHaveBeenCalled();
    // The failure did not replace it.
    expect(requestPreprDecision('/x').result).toBe('hero:DEVELOPERS');
  });

  it('asks again after 30 minutes, and for a failed answer after 10 seconds', () => {
    storeDecision('/x', 'hero:DEVELOPERS', 1_800_001);
    expect(requestPreprDecision('/x').result).toBeUndefined();
    delete (window as { __preprAsking?: unknown }).__preprAsking;
    storeDecision('/y', '*', 11_000);
    expect(requestPreprDecision('/y').result).toBeUndefined();
    expect(decisionRequests).toHaveBeenCalledTimes(2);
  });

  it('asks once for a page without personalization, then answers from the tab for an hour', async () => {
    decisionRequests.mockResolvedValueOnce(new Response(''));
    const first = requestPreprDecision('/static');
    // A second view while the first is in flight shares its request.
    requestPreprDecision('/static');
    await first.value;
    expect(requestPreprDecision('/static').result).toBe('');
    expect(decisionRequests).toHaveBeenCalledTimes(1);
    // No background check either, for most of an hour.
    storeDecision('/static', '', 3_500_000);
    expect(requestPreprDecision('/static').result).toBe('');
    storeDecision('/static', '', 3_600_001);
    expect(requestPreprDecision('/static').result).toBeUndefined();
    expect(decisionRequests).toHaveBeenCalledTimes(2);
  });

  it('asks at once when a page stored as without personalization now renders it', async () => {
    history.replaceState(null, '', '/x');
    Object.assign(window, {
      __preprApply: applyPreprDecisions,
      __preprRequest: requestPreprDecision,
    });
    document.body.innerHTML = renderToString(stack(hero));
    storeDecision('/x', '', 0);
    decisionRequests.mockResolvedValueOnce(new Response('hero:DEVELOPERS'));
    startPreprDecision();
    expect(decisionRequests).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve));
    expect(shown()).toEqual(['hero-dev']);
  });

  it('treats a malformed stored decision as none', () => {
    sessionStorage.setItem('prepr_decisions', '{"/x":{"value":5,"at":"no"}}');
    expect(requestPreprDecision('/x').result).toBeUndefined();
    sessionStorage.setItem('prepr_decisions', 'not json');
    delete (window as { __preprAsking?: unknown }).__preprAsking;
    expect(requestPreprDecision('/x').result).toBeUndefined();
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
    applyPreprDecisions('hero:DEVELOPERS'); // another page's view
    load('/pricing', null, hero);
    expect(shown()).toEqual([]);
  });

  it('shows the defaults when Prepr could not be asked, and nothing for a group the decision leaves out', () => {
    load('/a', '*', [...hero, logoStrip('DEVELOPERS')]);
    expect(shown()).toEqual(['hero-default', 'logos']);
    delete (window as { __preprDecision?: unknown }).__preprDecision;
    load('/b', 'logos:DEVELOPERS', [...hero, logoStrip('DEVELOPERS')]);
    expect(shown()).toEqual(['logos logo-DEVELOPERS']);
  });

  it('shows every decided variant of a group, but an item with a nested group only once', () => {
    load('/c', 'hero:DEVELOPERS|ALL_OTHER_USERS~logos:MARKETERS|DEVELOPERS', [
      ...hero,
      logoStrip('DEVELOPERS', 'MARKETERS'),
    ]);
    expect(shown()).toEqual([
      'hero-default',
      'hero-dev',
      'logos logo-MARKETERS',
    ]);
  });

  it("keeps the default variant's space, invisible, until the decision is in", () => {
    history.replaceState(null, '', '/r');
    const html = renderToString(stack(hero));
    // The base style reserves what this selector matches.
    const reserved =
      '[data-prepr-decision]:not([data-prepr-decided])~[data-prepr-v][data-prepr-default]';
    expect(html).toContain(`${reserved}{display:contents;visibility:hidden}`);
    document.body.innerHTML = html;
    const matched = () =>
      [...document.querySelectorAll(reserved)].map((el) => el.textContent);
    // Waiting: only the default holds its place, and nothing is shown.
    expect(matched()).toEqual(['hero-default']);
    expect(shown()).toEqual([]);

    applyPreprDecisions('hero:DEVELOPERS');
    expect(matched()).toEqual([]);
    expect(shown()).toEqual(['hero-dev']);
  });

  it('shows the defaults to visitors without JavaScript', () => {
    expect(renderToString(stack(hero))).toContain(
      '<noscript><style>[data-prepr-v][data-prepr-default]{display:contents!important;visibility:visible!important}</style></noscript>',
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

    vi.useFakeTimers();
    anchor.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }),
    );
    vi.advanceTimersByTime(65);
    vi.useRealTimers();
    // Asked on hover, for the page the link opens.
    const [url, init] = decisionRequests.mock.calls[0]!;
    expect(url).toBe('/solutions/astro-cms');
    expect(new Headers(init?.headers).get('Prepr-Decide')).toBe('1');
    await act(async () => answer('logos:DEVELOPERS'));

    await act(async () => {
      anchor.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0 }),
      );
      anchor.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    expect(navigations).toBe(1);
    // The press found the hover's answer: nothing more was asked.
    expect(decisionRequests).toHaveBeenCalledTimes(1);
    expect(shown()).toEqual(['logos logo-DEVELOPERS']);
    watcher.disconnect();
    expect([...everShown]).toEqual(['logos logo-DEVELOPERS']);
    act(() => root.unmount());
  });

  it('never holds a click, also to a page it has no decision for yet', async () => {
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
    decisionRequests.mockImplementationOnce(() => new Promise(() => {}));
    const anchor = container.querySelector('a')!;
    anchor.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0 }),
    );
    anchor.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    );
    expect(navigations).toBe(1);
    expect(decisionRequests).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it('leaves clicks alone', async () => {
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
});
