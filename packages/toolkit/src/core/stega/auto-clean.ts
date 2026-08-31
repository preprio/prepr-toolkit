import { vercelStegaSplit } from '@vercel/stega';

import { createScopedLogger } from '../utils';
import { decodeStega, type StegaDecodedData } from './clean';
import {
  isIgnoredTextNode,
  resolveEditTarget,
  tagEncodedElement,
  walkTextNodes,
} from './dom';

const debug = createScopedLogger('stega:auto-clean');

interface CleanedInfo {
  original: string;
  cleaned: string;
  /** Kept so a node hidden at clean time can still be tagged once shown. */
  decoded: StegaDecodedData;
}

export interface StegaAutoClean {
  /** Scan+clean the document and observe for future mutations. Idempotent. */
  start(): void;
  stop(): void;
}

export interface StegaAutoCleanOptions {
  /**
   * Strip stega characters from visible text. Default `true`.
   *
   * `false` leaves the encoded text in the DOM. Only turn this off when the
   * site strips the characters itself (for example by calling `stegaClean` on
   * every field as it renders) — otherwise the invisible payload stays visible
   * to visitors, breaks text measurement and `String.length`, and is read out
   * by screen readers.
   *
   * Click-to-edit tagging is unaffected: elements are still tagged from the
   * payload, so the overlay keeps working either way.
   */
  enabled?: boolean;
}

/**
 * Strips stega characters out of visible text at runtime, tagging the closest
 * `[data-prepr-edit-target]` ancestor (or the parent) so the overlay can find
 * it. A debounced MutationObserver re-cleans nodes that frameworks re-render
 * back to their encoded form.
 */
export function createStegaAutoClean(
  options?: StegaAutoCleanOptions,
): StegaAutoClean {
  const stripText = options?.enabled ?? true;
  let observer: MutationObserver | null = null;
  let processing = false;
  let cleaned = new WeakMap<Text, CleanedInfo>();
  // Nodes stripped while their element had no layout box. Held strongly (a
  // WeakSet could not be iterated) and dropped as soon as tagging succeeds.
  let pendingHidden = new Set<Text>();
  // Nodes seen by the observer but not yet flushed. Accumulated across
  // debounce restarts so a superseded batch is deferred, never dropped.
  let pendingDirty = new Set<Text>();
  let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

  function cleanTextNode(textNode: Text): boolean {
    if (isIgnoredTextNode(textNode)) return false;

    const textContent = textNode.textContent!;
    const info = cleaned.get(textNode);
    // With stripping disabled the text keeps its payload, so the "already
    // handled" marker is the original rather than the stripped form.
    const settled = stripText ? info?.cleaned : info?.original;
    if (info && textContent === settled) {
      // Already handled, so there is nothing left to strip. If the
      // element had no layout box back then (a collapsed dropdown, a closed
      // accordion) it never got tagged, and revealing it fires no mutation the
      // observer can see — so retry the tagging from the remembered payload.
      const shown = resolveEditTarget(textNode);
      if (!shown) return false;
      pendingHidden.delete(textNode);
      if (shown.hasAttribute('data-prepr-encoded')) return false;
      tagEncodedElement(shown, info.decoded);
      return true;
    }

    try {
      const { cleaned: stripped, encoded } = vercelStegaSplit(textContent);
      if (!encoded || stripped === textContent) return false;

      const decoded = decodeStega(textContent);
      if (!decoded?.href) return false;

      cleaned.set(textNode, {
        original: textContent,
        cleaned: stripped,
        decoded,
      });
      if (stripText) textNode.textContent = stripped;

      const target = resolveEditTarget(textNode);

      if (target) {
        pendingHidden.delete(textNode);
        tagEncodedElement(target, decoded);
        return true;
      }
      // No box yet; `decoded` is retained above so a later pass can tag it.
      pendingHidden.add(textNode);
    } catch (error) {
      debug.log('error cleaning text node', error as object);
    }
    return false;
  }

  function scanAndClean(): void {
    processing = true;
    walkTextNodes(document.body, cleanTextNode);
    // <title> lives in <head>, outside the body walk — encoded titles show
    // raw garbage in the browser tab. Nothing to tag; just strip.
    if (stripText) {
      const title = vercelStegaSplit(document.title);
      if (title.encoded) document.title = title.cleaned;
    }
    processing = false;
  }

  function collectAffected(mutations: MutationRecord[]): Set<Text> {
    const affected = new Set<Text>();
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            affected.add(node as Text);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            walkTextNodes(node, (textNode) => affected.add(textNode));
          }
        });
      }
      if (
        mutation.type === 'characterData' &&
        mutation.target.nodeType === Node.TEXT_NODE
      ) {
        const textNode = mutation.target as Text;
        const info = cleaned.get(textNode);
        // framework re-render put the encoded text back; clean it again
        if (info && textNode.textContent === info.original) {
          affected.add(textNode);
        }
      }
    });
    return affected;
  }

  /**
   * Re-attempt the nodes parked as hidden. Showing a dropdown mutates a class
   * or inline style rather than the text, so these need a pass of their own.
   */
  function retryPendingHidden(): void {
    if (pendingHidden.size === 0) return;
    processing = true;
    // Copy first: cleanTextNode deletes from the set as nodes resolve.
    [...pendingHidden].forEach((textNode) => {
      if (!textNode.isConnected) {
        pendingHidden.delete(textNode);
        return;
      }
      cleanTextNode(textNode);
    });
    processing = false;
  }

  function handleMutations(mutations: MutationRecord[]): void {
    if (processing) return;
    const affected = collectAffected(mutations);
    if (affected.size === 0) {
      retryPendingHidden();
      return;
    }

    // Accumulate across batches. Each debounce restart cancels the previous
    // flush, so a batch that only lived in a local set would be dropped
    // outright — on a streaming or hydrating page, where mutations land
    // faster than the debounce interval, that left most nodes encoded.
    affected.forEach((textNode) => pendingDirty.add(textNode));

    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      debounceTimeout = null;
      processing = true;
      const batch = [...pendingDirty];
      pendingDirty.clear();
      batch.forEach((textNode) => {
        if (textNode.isConnected) cleanTextNode(textNode);
      });
      processing = false;
      retryPendingHidden();
    }, 50);
  }

  function setupObserver(): void {
    observer = new MutationObserver(handleMutations);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      // A dropdown opening only toggles a class or inline style; without these
      // the nodes it reveals are never revisited and stay untagged.
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-expanded'],
    });
  }

  function start(): void {
    if (observer || typeof window === 'undefined') return;

    // Synchronous on purpose: the first scan must win the race against both
    // the click-to-edit tagging pass (which tags without stripping) and the
    // reload a preview-mode transition triggers — a deferred
    // requestIdleCallback scan was killed by that reload, leaving elements
    // tagged but still encoded.
    scanAndClean();
    setupObserver();
    debug.log('stega auto-clean started');
  }

  function stop(): void {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      debounceTimeout = null;
    }
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    cleaned = new WeakMap();
    pendingHidden = new Set();
    pendingDirty = new Set();
    debug.log('stega auto-clean stopped');
  }

  return { start, stop };
}
