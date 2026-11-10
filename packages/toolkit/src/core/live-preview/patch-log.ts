import type { LiveListEntry, LiveValue } from './patch';
import {
  isLiveFieldChange,
  isPlainRecord,
  parseEditTarget,
  parseListEntries,
  type LiveEditTarget,
} from './validate';

const MAX_LOG_ENTRIES = 500;
const MAX_LOG_SOURCE_LENGTH = 1_000_000;

/**
 * One unsaved change from the Prepr editor: the `_id` of the item (or stack
 * entry) that owns the field, and the field's API name or a dotted path below
 * it (`content.headline_style`, `content.3.body`).
 */
export type LivePatch =
  | {
      type: 'field';
      itemId: string;
      field: string;
      value: LiveValue;
      /** Edit-link target for text that has none yet (an unsaved entry). */
      edit?: LiveEditTarget;
    }
  | { type: 'list'; itemId: string; field: string; entries: LiveListEntry[] };

/**
 * Validate a patch log from an untrusted source (a request body, a cookie).
 * Accepts the array or its JSON text, drops malformed entries, never throws.
 */
export function parsePatchLog(raw: unknown): LivePatch[] {
  let value = raw;
  if (typeof value === 'string') {
    if (!value || value.length > MAX_LOG_SOURCE_LENGTH) return [];
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const log: LivePatch[] = [];
  for (const entry of value.slice(-MAX_LOG_ENTRIES)) {
    if (!isPlainRecord(entry)) continue;
    const { type, itemId, field } = entry;
    if (typeof itemId !== 'string' || !itemId) continue;
    if (typeof field !== 'string' || !field) continue;
    if (type === 'field' && isLiveFieldChange(field, entry.value)) {
      const edit = parseEditTarget(entry.edit);
      log.push(
        edit
          ? { type, itemId, field, value: entry.value, edit }
          : { type, itemId, field, value: entry.value },
      );
    } else if (type === 'list') {
      const entries = parseListEntries(entry.entries);
      if (entries) log.push({ type, itemId, field, entries });
    }
  }
  return log;
}
