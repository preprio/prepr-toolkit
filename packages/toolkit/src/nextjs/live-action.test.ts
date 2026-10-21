// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, { value: string; options: unknown }>();
const refresh = vi.fn();
vi.mock('next/cache', () => ({ refresh }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const c = jar.get(name);
      return c ? { name, value: c.value } : undefined;
    },
    set: (name: string, value: string, options: unknown) =>
      jar.set(name, { value, options }),
  }),
  headers: async () => new Headers(),
}));

const { syncPreprLiveLog } = await import('./live-action');
const { normalizeQuery, getPreprLiveLog } = await import('./server');

const QUERY = '{ Post { _id title } }';
const data = { Post: { _id: 'p', title: 'Old' } };

describe('syncPreprLiveLog + normalizeQuery', () => {
  beforeEach(() => {
    jar.clear();
    refresh.mockClear();
  });

  it('hands the log to the re-render through a token cookie that expires at once', async () => {
    await syncPreprLiveLog([
      { type: 'field', itemId: 'p', field: 'title', value: 'New' },
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
    const cookie = jar.get('__prepr_live')!;
    expect(cookie.value).toMatch(/^[0-9a-f]{32}$/);
    expect(cookie.options).toMatchObject({ maxAge: 0, httpOnly: true });
    const page = await normalizeQuery(QUERY, data, { enabled: true });
    expect(page.Post.title).toBe('New');
  });

  it('never applies a log unless enabled, and does not read the request then', async () => {
    await syncPreprLiveLog([
      { type: 'field', itemId: 'p', field: 'title', value: 'New' },
    ]);
    const get = vi.spyOn(Map.prototype, 'get');
    get.mockClear();
    expect(await normalizeQuery(QUERY, data)).toBe(data);
    expect(await normalizeQuery(QUERY, data, { enabled: false })).toBe(data);
    expect(get).not.toHaveBeenCalledWith('__prepr_live');
    get.mockRestore();
  });

  it('ignores a cookie that carries a log instead of an issued token', async () => {
    jar.set('__prepr_live', {
      value: JSON.stringify([
        { type: 'field', itemId: 'p', field: 'title', value: 'Forged' },
      ]),
      options: {},
    });
    expect(await getPreprLiveLog()).toEqual([]);
    expect(await normalizeQuery(QUERY, data, { enabled: true })).toBe(data);
  });

  it('does nothing for an empty or malformed log', async () => {
    await syncPreprLiveLog('nope');
    await syncPreprLiveLog([
      { type: 'field', itemId: '', field: 'x', value: 1 },
    ]);
    expect(refresh).not.toHaveBeenCalled();
    expect(jar.size).toBe(0);
  });
});
