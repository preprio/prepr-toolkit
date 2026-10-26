import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startPreprAuto } from './auto-start';

const PAYLOAD = {
  props: {
    activeSegment: null,
    activeVariant: null,
    segments: [{ _id: 'seg-1', name: 'Students' }],
  },
};

function render(payload: unknown = PAYLOAD): void {
  document.body.innerHTML = `<main>Page</main><script type="application/json" data-prepr-toolbar-props>${JSON.stringify(payload)}</script>`;
}

const toolbar = () => document.querySelector('prepr-toolbar');
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('startPreprAuto', () => {
  let stop: () => void = () => {};

  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    stop();
    vi.unstubAllGlobals();
  });

  it('does nothing on a page without toolbar props', () => {
    stop = startPreprAuto();
    expect(toolbar()).toBeNull();
  });

  it('ignores props it cannot parse', () => {
    document.body.innerHTML =
      '<script type="application/json" data-prepr-toolbar-props>{nope</script>';
    stop = startPreprAuto();
    expect(toolbar()).toBeNull();
  });

  it('mounts the toolbar from the server-rendered props', () => {
    render();
    stop = startPreprAuto();
    expect(toolbar()).not.toBeNull();
  });

  it('mounts the toolbar again when a page swap replaces <body>', async () => {
    render();
    stop = startPreprAuto();
    const next = document.createElement('body');
    next.innerHTML = `<main>Next</main><script type="application/json" data-prepr-toolbar-props>${JSON.stringify(PAYLOAD)}</script>`;
    document.body.replaceWith(next);
    expect(toolbar()).toBeNull();
    await flush();
    expect(toolbar()).not.toBeNull();
    expect(document.querySelectorAll('prepr-toolbar')).toHaveLength(1);
  });

  it('mounts the toolbar again when a swap empties <body>', async () => {
    render();
    stop = startPreprAuto();
    document.body.innerHTML = '<main>Next</main>';
    await flush();
    expect(toolbar()).not.toBeNull();
  });

  it('stops watching once stopped', async () => {
    render();
    stop();
    stop = startPreprAuto();
    stop();
    document.body.innerHTML = '<main>Next</main>';
    await flush();
    expect(toolbar()).toBeNull();
  });

  it('reloads inside the Prepr editor, which connects only on frame load', async () => {
    vi.stubGlobal('top', {} as Window);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload, search: '' });
    render();
    stop = startPreprAuto();
    const next = document.createElement('body');
    document.body.replaceWith(next);
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
