import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startHtmlLivePreview, type HtmlLivePreview } from './html-live';

function post(data: unknown, origin = 'https://editor.prepr.io'): void {
  window.dispatchEvent(new MessageEvent('message', { data, origin }));
}

describe('startHtmlLivePreview', () => {
  let live: HtmlLivePreview;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('top', {} as Window);
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response('<html><body><h1>Changed</h1></body></html>', {
        status: 200,
      }),
    );
    document.body.innerHTML = '<h1>Stored</h1>';
    live = startHtmlLivePreview();
  });
  afterEach(() => {
    live.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('re-renders the page with the unsaved changes once typing pauses', async () => {
    post({ event: 'prepr:initVE' });
    post({
      event: 'prepr:fieldChange',
      itemId: 'p',
      field: 'title',
      value: 'C',
    });
    post({
      event: 'prepr:fieldChange',
      itemId: 'p',
      field: 'title',
      value: 'Ch',
    });
    await vi.advanceTimersByTimeAsync(200);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(window.location.href);
    expect(init.method).toBe('POST');
    expect(init.headers['x-prepr-live']).toBe('1');
    expect(JSON.parse(init.body)).toEqual({
      log: [{ type: 'field', itemId: 'p', field: 'title', value: 'Ch' }],
    });
    expect(document.body.innerHTML).toBe('<h1>Changed</h1>');
  });

  it('keeps the page when the re-render arrives cut off', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html><body><nav>Menu</nav><main><h1>Hal', {
        status: 200,
      }),
    );
    post({ event: 'prepr:initVE' });
    post({
      event: 'prepr:fieldChange',
      itemId: 'p',
      field: 'title',
      value: 'C',
    });
    await vi.advanceTimersByTimeAsync(200);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.body.innerHTML).toBe('<h1>Stored</h1>');
  });

  it('requests the stored page on save', async () => {
    post({ event: 'prepr:initVE' });
    post({ event: 'prepr:itemChanged', itemId: 'p' });
    await vi.advanceTimersByTimeAsync(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
  });

  it('ignores changes from a page that is not the Prepr editor', async () => {
    post({ event: 'prepr:initVE' }, 'https://attacker.example');
    post(
      { event: 'prepr:fieldChange', itemId: 'p', field: 'title', value: 'x' },
      'https://attacker.example',
    );
    await vi.advanceTimersByTimeAsync(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('startHtmlLivePreview outside the editor', () => {
  it('does nothing', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const live = startHtmlLivePreview();
    post({ event: 'prepr:initVE' });
    post({
      event: 'prepr:fieldChange',
      itemId: 'p',
      field: 'title',
      value: 'x',
    });
    live.stop();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('startHtmlLivePreview apply modes', () => {
  const fetchMock = vi.fn();
  let live: HtmlLivePreview | null = null;
  const page =
    '<h1 data-prepr-encoded data-prepr-id="p" data-prepr-field="title">Stored</h1>';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('top', {} as Window);
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response(`<html><body>${page}</body></html>`, { status: 200 }),
    );
    document.body.innerHTML = page;
  });
  afterEach(() => {
    live?.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const type = (value: unknown, fieldName = 'title') =>
    post({ event: 'prepr:fieldChange', itemId: 'p', field: fieldName, value });

  it("'dom' writes text into the page without asking the server", async () => {
    live = startHtmlLivePreview({ apply: 'dom' });
    post({ event: 'prepr:initVE' });
    type('Typed');
    await vi.advanceTimersByTimeAsync(400);
    expect(document.querySelector('h1')!.textContent).toBe('Typed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("'dom' leaves what it cannot show for the save", async () => {
    live = startHtmlLivePreview({ apply: 'dom' });
    post({ event: 'prepr:initVE' });
    type({ url: 'https://cdn.example/a.jpg' }, 'image');
    await vi.advanceTimersByTimeAsync(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("'dom' renders the stored page on save", async () => {
    live = startHtmlLivePreview({ apply: 'dom' });
    post({ event: 'prepr:initVE' });
    type('Typed');
    post({ event: 'prepr:itemChanged', itemId: 'p' });
    await vi.advanceTimersByTimeAsync(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
    expect(document.querySelector('h1')!.textContent).toBe('Stored');
  });
});
