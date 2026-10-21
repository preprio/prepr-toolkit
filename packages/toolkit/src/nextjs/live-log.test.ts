// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { putLiveLog, takeLiveLog as readLiveLog } from './live-log';

const log = [
  { type: 'field' as const, itemId: 'a', field: 'title', value: 'x' },
];

describe('live log handover', () => {
  afterEach(() => vi.useRealTimers());

  it('returns the log for the token it issued', () => {
    const token = putLiveLog(log);
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(readLiveLog(token)).toEqual(log);
  });

  it('honours a token once', () => {
    const token = putLiveLog(log);
    expect(readLiveLog(token)).toEqual(log);
    expect(readLiveLog(token)).toEqual([]);
  });

  it('returns nothing for a token it did not issue', () => {
    expect(readLiveLog(undefined)).toEqual([]);
    expect(readLiveLog('')).toEqual([]);
    expect(readLiveLog('0'.repeat(32))).toEqual([]);
    expect(readLiveLog('[{"type":"field"}]')).toEqual([]);
  });

  it('forgets a log once it expires', () => {
    vi.useFakeTimers();
    const token = putLiveLog(log);
    vi.advanceTimersByTime(16_000);
    expect(readLiveLog(token)).toEqual([]);
  });

  it('keeps memory bounded under bulk calls', () => {
    const first = putLiveLog(log);
    for (let i = 0; i < 60; i++) putLiveLog(log);
    expect(readLiveLog(first)).toEqual([]);
  });
});
