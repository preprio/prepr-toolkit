import { vercelStegaSplit } from '@vercel/stega';

import { createScopedLogger } from '../utils';
import { decodeStega } from './clean';
import { isIgnoredTextNode, tagEncodedElement, walkTextNodes } from './dom';

const debug = createScopedLogger('stega:auto-clean');

interface CleanedInfo {
  original: string;
  cleaned: string;
}

export interface StegaAutoClean {
  /** Scan+clean the document and observe for future mutations. Idempotent. */
  start(): void;
  stop(): void;
}

/**
 * Strips stega characters out of visible text at runtime, tagging the closest
 * `[data-prepr-edit-target]` ancestor (or the parent) so the overlay can find
 * it. A debounced MutationObserver re-cleans nodes that frameworks re-render
 * back to their encoded form.
 */
export function createStegaAutoClean(): StegaAutoClean {
  let observer: MutationObserver | null = null;
  let processing = false;
  let cleaned = new WeakMap<Text, CleanedInfo>();
  let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

  function cleanTextNode(textNode: Text): boolean {
    if (isIgnoredTextNode(textNode)) return false;

    const textContent = textNode.textContent!;
    const info = cleaned.get(textNode);
    if (info && textContent === info.cleaned) return false;

    try {
      const { cleaned: stripped, encoded } = vercelStegaSplit(textContent);
      if (!encoded || stripped === textContent) return false;

      const decoded = decodeStega(textContent);
      if (!decoded?.href) return false;

      cleaned.set(textNode, { original: textContent, cleaned: stripped });
      textNode.textContent = stripped;

      let target: HTMLElement | null = textNode.parentElement;
      const editTargetParent = textNode.parentElement?.closest(
        '[data-prepr-edit-target]',
      );
      if (editTargetParent) target = editTargetParent as HTMLElement;

      if (target) {
        tagEncodedElement(target, decoded);
        return true;
      }
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
    const title = vercelStegaSplit(document.title);
    if (title.encoded) document.title = title.cleaned;
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

  function handleMutations(mutations: MutationRecord[]): void {
    if (processing) return;
    const affected = collectAffected(mutations);
    if (affected.size === 0) return;

    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      processing = true;
      affected.forEach((textNode) => cleanTextNode(textNode));
      processing = false;
    }, 50);
  }

  function setupObserver(): void {
    observer = new MutationObserver(handleMutations);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
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
    debug.log('stega auto-clean stopped');
  }

  return { start, stop };
}
