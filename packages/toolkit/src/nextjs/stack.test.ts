// The A/B switch runs in the browser, so this suite uses the DOM environment.
import { createElement, type ReactNode } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

const { PreprStack } = await import('./graphql');
const { PREPR_BUCKET_COOKIE } = await import('./bucket');
const { applyPreprAbBucket, applyPreprDecisions } = await import('./ab-switch');

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
      decisions: Promise.resolve(new Map()),
      render,
      ...props,
    }),
  );
}

afterEach(() => {
  delete (window as { __preprAbBucket?: string }).__preprAbBucket;
  delete (window as { __preprAbSheet?: unknown }).__preprAbSheet;
  delete (window as { __preprDecisions?: unknown }).__preprDecisions;
  delete (window as { __preprDecisionSheet?: unknown }).__preprDecisionSheet;
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

  it('is off by default: the markup stays as it was', () => {
    const out = renderToString(
      createElement(PreprStack<{ id: string }>, {
        items: abItems,
        decisions: Promise.resolve(new Map()),
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
          decisions: Promise.resolve(new Map()),
          render: section,
          trackVariants: true,
        }),
      );
    });

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
          decisions: Promise.resolve(new Map()),
          render: section,
          trackVariants: true,
        }),
      );
    });

    expect(
      [...container.querySelectorAll('section')].map((el) =>
        el.getAttribute('data-prepr-variant-key'),
      ),
    ).toEqual(['key-ALL_OTHER_USERS', 'key-private']);
    act(() => root.unmount());
  });

  it("tags a segment group's variant only once the visitor's variant is in", async () => {
    const items = [
      {
        id: 'hero-default',
        ...tracked('PERSONALIZATION', 'g', 'ALL_OTHER_USERS'),
      },
      { id: 'hero-dev', ...tracked('PERSONALIZATION', 'g', 'DEVELOPERS') },
    ];
    let decide!: (decisions: Map<string, string[]>) => void;
    const decisions = new Promise<Map<string, string[]>>((resolve) => {
      decide = resolve;
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(PreprStack<{ id: string }>, {
          items,
          decisions,
          render: section,
          trackVariants: true,
        }),
      );
    });
    await act(async () => decide(new Map([['g', ['DEVELOPERS']]])));

    const el = container.querySelector('section')!;
    expect(el.textContent).toBe('hero-dev');
    expect(el.getAttribute('data-prepr-variant-key')).toBe('key-DEVELOPERS');
    act(() => root.unmount());
  });
});

describe('PreprStack aboveTheFold', () => {
  const seg = (variant: string) => ({
    _preprContext: {
      kind: 'PERSONALIZATION',
      group_id: 'hero',
      variant_id: variant,
    },
  });
  const heroItems = [
    { id: 'hero-default', ...seg('ALL_OTHER_USERS') },
    { id: 'hero-dev', ...seg('DEVELOPERS') },
    { id: 'below', ...ctx('PERSONALIZATION', 'g-below', 'ALL_OTHER_USERS') },
  ];
  const out = () =>
    renderToString(
      createElement(PreprStack<{ id: string }>, {
        items: heroItems,
        decisions: new Promise<Map<string, string[]>>(() => {}),
        render,
        aboveTheFold: 1,
      }),
    );

  it('renders every variant of an above-the-fold group in the page, default marked', () => {
    const html = out();
    expect(html).toContain(
      '<div data-prepr-group="hero" data-prepr-variant="ALL_OTHER_USERS" data-prepr-default=""><p>hero-default</p></div>',
    );
    expect(html).toContain(
      '<div data-prepr-group="hero" data-prepr-variant="DEVELOPERS"><p>hero-dev</p></div>',
    );
    expect(html).toContain(
      '[data-prepr-group]:not([data-prepr-default]){display:none}',
    );
  });

  it('keeps streaming groups below the fold', () => {
    const html = out();
    expect(html).toContain('<p>below</p>');
    expect(html).not.toContain('data-prepr-group="g-below"');
  });

  it('shows the decided variant before paint, and none for a group decided as "none"', () => {
    const rules = () =>
      [
        ...(window as unknown as { __preprDecisionSheet: CSSStyleSheet })
          .__preprDecisionSheet.cssRules,
      ]
        .map((r) => r.cssText.replace(/\s+/g, ''))
        .join('');

    document.cookie = 'prepr_decisions=hero%3ADEVELOPERS; path=/';
    applyPreprDecisions();
    expect(rules()).toBe(
      '[data-prepr-group="hero"]{display:none!important;}[data-prepr-group="hero"][data-prepr-variant="DEVELOPERS"]{display:contents!important;}',
    );

    document.cookie = 'prepr_decisions=hero%3A; path=/';
    applyPreprDecisions();
    expect(rules()).toBe('[data-prepr-group="hero"]{display:none!important;}');
    document.cookie = 'prepr_decisions=; max-age=0; path=/';
  });

  it('ignores ids that could inject CSS', () => {
    document.cookie = `prepr_decisions=${encodeURIComponent('x"]{}body{display:none}:a~hero:B')}; path=/`;
    applyPreprDecisions();
    const sheet = (window as unknown as { __preprDecisionSheet: CSSStyleSheet })
      .__preprDecisionSheet;
    const css = [...sheet.cssRules].map((r) => r.cssText).join('');
    expect(css).not.toContain('body');
    document.cookie = 'prepr_decisions=; max-age=0; path=/';
  });
});
