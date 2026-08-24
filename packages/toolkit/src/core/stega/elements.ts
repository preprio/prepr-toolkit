import { createScopedLogger } from '../utils';
import { decodeStega, type StegaDecodedData } from './clean';
import {
  isIgnoredTextNode,
  resolveEditTarget,
  tagEncodedElement,
  walkTextNodes,
} from './dom';

const debug = createScopedLogger('stega:elements');

type DecodeFn = (str: string | null) => StegaDecodedData | null;

/**
 * Detects stega-encoded text nodes and tags their parent elements, keeping the
 * set current via a debounced MutationObserver. Call `scanDocument()` +
 * `setupMutationObserver()` to start, `cleanup()` to stop.
 */
export class StegaElements {
  private elements: NodeListOf<Element> | undefined;
  private observer: MutationObserver | null = null;
  private decode: DecodeFn;

  constructor(decode: DecodeFn = decodeStega) {
    this.decode = decode;
  }

  getElements(): NodeListOf<Element> {
    if (!this.elements) {
      this.elements = document.querySelectorAll('[data-prepr-encoded]');
    }
    return this.elements;
  }

  /** Returns true only when this tags an element that wasn't tagged before. */
  private tagFromTextNode(node: Text): boolean {
    const decoded = this.decode(node.textContent);
    if (!decoded?.href) return false;
    const target = resolveEditTarget(node);
    if (!target || target.hasAttribute('data-prepr-encoded')) return false;
    tagEncodedElement(target, decoded);
    return true;
  }

  private scanNode(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      if (isIgnoredTextNode(node)) return;
      this.tagFromTextNode(node as Text);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      node.childNodes.forEach((child) => this.scanNode(child));
    }
  }

  /**
   * `skipIfTagged` reuses whatever the auto-clean pass already tagged instead
   * of re-walking the body.
   */
  scanDocument(skipIfTagged = false): void {
    if (skipIfTagged) {
      const existing = document.querySelectorAll('[data-prepr-encoded]');
      if (existing.length > 0) {
        this.elements = existing;
        return;
      }
    }

    let encodedCount = 0;
    walkTextNodes(document.body, (textNode) => {
      if (this.tagFromTextNode(textNode)) encodedCount++;
    });

    debug.log('document scan complete, encoded', encodedCount, 'elements');
    this.elements = document.querySelectorAll('[data-prepr-encoded]');
  }

  /** `onUpdate` fires after each debounced batch, for refreshing derived state. */
  setupMutationObserver(onUpdate?: () => void): void {
    if (this.observer) {
      this.observer.disconnect();
    }

    let pending: MutationRecord[] = [];
    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

    const processMutations = () => {
      const addedNodes = new Set<Node>();
      pending.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => addedNodes.add(node));
        if (mutation.type === 'characterData') {
          addedNodes.add(mutation.target);
        }
      });
      addedNodes.forEach((node) => this.scanNode(node));
      pending = [];
      this.elements = document.querySelectorAll('[data-prepr-encoded]');
      onUpdate?.();
    };

    this.observer = new MutationObserver((mutations) => {
      pending.push(...mutations);
      if (debounceTimeout) clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(processMutations, 100);
    });
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  /** Drops the active class but keeps the data attributes, unlike cleanup(). */
  cleanupVisuals(): void {
    document
      .querySelectorAll('.prepr-overlay-active')
      .forEach((element) => element.classList.remove('prepr-overlay-active'));
  }

  cleanup(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    document.querySelectorAll('[data-prepr-encoded]').forEach((element) => {
      element.removeAttribute('data-prepr-encoded');
      element.removeAttribute('data-prepr-href');
      element.removeAttribute('data-prepr-origin');
      element.classList.remove('prepr-overlay-active');
    });
    this.elements = undefined;
  }
}
