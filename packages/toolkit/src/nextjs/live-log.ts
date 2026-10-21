import type { LivePatch } from '../core/live-preview/normalize-query';

// Hands the log from `syncPreprLiveLog` to the render it triggers: the log
// stays in this process under a random single-use token, and only the token
// goes into an already-expired cookie, which Next shows to the re-render of
// the same request. A forged or replayed cookie (a plain GET, cacheable by a
// CDN) matches nothing. The store lives on `globalThis` because the action
// and the server helpers ship as separate bundles.

export const LIVE_LOG_COOKIE = '__prepr_live';

// The re-render reads the log within milliseconds; the limits only bound
// memory when the action is called in bulk.
const TTL_MS = 15_000;
const MAX_SLOTS = 50;
const TOKEN_PATTERN = /^[0-9a-f]{32}$/;

interface Slot {
  log: LivePatch[];
  expires: number;
}

const KEY = Symbol.for('@preprio/toolkit/live-log');

function slots(): Map<string, Slot> {
  const holder = globalThis as unknown as Record<symbol, unknown>;
  let map = holder[KEY] as Map<string, Slot> | undefined;
  if (!map) {
    map = new Map();
    holder[KEY] = map;
  }
  return map;
}

function prune(map: Map<string, Slot>, now: number): void {
  for (const [token, slot] of map) {
    if (slot.expires <= now) map.delete(token);
  }
  // Insertion order is age order.
  while (map.size >= MAX_SLOTS) {
    map.delete(map.keys().next().value as string);
  }
}

/** Store a validated log and return the token that retrieves it. */
export function putLiveLog(log: LivePatch[]): string {
  const map = slots();
  const now = Date.now();
  prune(map, now);
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  map.set(token, { log, expires: now + TTL_MS });
  return token;
}

/**
 * The log stored under `token`, removed so it cannot be replayed; an empty
 * list for anything else. Callers memoize the result per render.
 */
export function takeLiveLog(token: string | undefined): LivePatch[] {
  if (!token || !TOKEN_PATTERN.test(token)) return [];
  const map = slots();
  const slot = map.get(token);
  map.delete(token);
  const now = Date.now();
  prune(map, now);
  if (!slot || slot.expires <= now) return [];
  return slot.log;
}
