// ../../node_modules/.pnpm/@vercel+stega@1.1.0/node_modules/@vercel/stega/dist/index.mjs
var p = { 0: 8203, 1: 8204, 2: 8205, 3: 8290, 4: 8291, 5: 8288, 6: 65279, 7: 8289, 8: 119155, 9: 119156, a: 119157, b: 119158, c: 119159, d: 119160, e: 119161, f: 119162 };
var l = { 0: 8203, 1: 8204, 2: 8205, 3: 65279 };
var d = { 0: String.fromCodePoint(l[0]), 1: String.fromCodePoint(l[1]), 2: String.fromCodePoint(l[2]), 3: String.fromCodePoint(l[3]) };
var u = new Array(4).fill(String.fromCodePoint(l[0])).join("");
var g = String.fromCharCode(0);
var m = Object.fromEntries(Object.entries(d).map((e2) => [e2[1], +e2[0]]));
var T = Object.fromEntries(Object.entries(p).map((e2) => e2.reverse()));
var h = `${Object.values(p).map((e2) => `\\u{${e2.toString(16)}}`).join("")}`;
var x = new RegExp(`[${h}]{4,}`, "gu");
function X(e2) {
  let r2 = e2.match(x);
  if (r2) return E(r2[0], true)[0];
}
function E(e2, r2 = false) {
  let t3 = Array.from(e2), i2 = 1 / 0, c2 = -1;
  for (let n2 = 0; n2 < t3.length; ++n2) t3[n2] === u[0] && t3[n2 + 1] === u[1] && t3[n2 + 2] === u[2] && t3[n2 + 3] === u[3] && (i2 = Math.min(i2, n2), c2 = Math.max(c2, n2));
  if (c2 === -1) return _(t3, r2);
  for (let n2 = i2; n2 <= c2; ++n2) if (!((t3.length - n2) % 4)) try {
    let f3 = t3.slice(n2 + 4), s2 = new Uint8Array(f3.length / 4);
    for (let o2 = 0; o2 < s2.length; o2++) s2[o2] = m[f3[o2 * 4]] << 6 | m[f3[o2 * 4 + 1]] << 4 | m[f3[o2 * 4 + 2]] << 2 | m[f3[o2 * 4 + 3]];
    let a2 = new TextDecoder().decode(s2);
    if (r2) {
      let o2 = a2.indexOf(g);
      return o2 === -1 && (o2 = a2.length), [JSON.parse(a2.slice(0, o2))];
    }
    return a2.split(g).filter(Boolean).map((o2) => JSON.parse(o2));
  } catch {
  }
  return [];
}
function _(e2, r2) {
  var f3;
  let t3 = [];
  for (let s2 = e2.length * 0.5; s2--; ) {
    let a2 = `${T[e2[s2 * 2].codePointAt(0)]}${T[e2[s2 * 2 + 1].codePointAt(0)]}`;
    t3.unshift(String.fromCharCode(parseInt(a2, 16)));
  }
  let i2 = [], c2 = [t3.join("")], n2 = 10;
  for (; c2.length; ) {
    let s2 = c2.shift();
    try {
      if (i2.push(JSON.parse(s2)), r2) return i2;
    } catch (a2) {
      if (!n2--) throw a2;
      let o2 = +((f3 = a2.message.match(/\sposition\s(\d+)$/)) == null ? void 0 : f3[1]);
      if (!o2) throw a2;
      c2.unshift(s2.substring(0, o2), s2.substring(o2));
    }
  }
  return i2;
}
function P(e2) {
  var r2;
  return { cleaned: e2.replace(x, ""), encoded: ((r2 = e2.match(x)) == null ? void 0 : r2[0]) || "" };
}

// ../../packages/toolkit/dist/chunk-NRPVGEUK.js
var trustedParentOrigin = null;
function setTrustedParentOrigin(origin) {
  trustedParentOrigin = origin;
}
function sendPreprEvent(event, data, options) {
  if (typeof window !== "undefined") {
    const message = {
      name: "prepr_preview_bar",
      event,
      ...data
    };
    window.dispatchEvent(
      new CustomEvent("prepr_preview_bar", { detail: message })
    );
    if (window.parent && window.parent !== window) {
      if (trustedParentOrigin) {
        window.parent.postMessage(message, trustedParentOrigin);
      } else if (options?.allowUntrustedTarget) {
        window.parent.postMessage(message, "*");
      }
    }
  }
}
var DebugLogger = class {
  constructor(options) {
    this.options = {
      prefix: "[Prepr]",
      ...options
    };
  }
  // A local `enabled` wins; otherwise defer to the global logger so scoped
  // loggers created before initDebugLogger() still pick up the setting.
  isEnabled() {
    if (this.options.enabled !== void 0) {
      return this.options.enabled;
    }
    return globalDebugLogger?.options?.enabled ?? false;
  }
  log(message, ...args) {
    if (!this.isEnabled()) return;
    const prefix = this.options.prefix;
    console.log(`${prefix} ${message}`, ...args);
  }
  warn(message, ...args) {
    if (!this.isEnabled()) return;
    const prefix = this.options.prefix;
    console.warn(`${prefix} ${message}`, ...args);
  }
  error(message, ...args) {
    if (!this.isEnabled()) return;
    const prefix = this.options.prefix;
    console.error(`${prefix} ${message}`, ...args);
  }
};
var globalDebugLogger = null;
function initDebugLogger(enabled = false) {
  globalDebugLogger = new DebugLogger({ enabled });
}
function createScopedLogger(scopeName) {
  return new DebugLogger({
    prefix: `[Prepr][${scopeName}]`
  });
}
function throttle(func, delay) {
  let timeoutId = null;
  let lastExecTime = 0;
  const throttledFunc = ((...args) => {
    const currentTime = Date.now();
    const timeSinceLastExec = currentTime - lastExecTime;
    if (timeSinceLastExec >= delay) {
      func(...args);
      lastExecTime = currentTime;
    } else {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        func(...args);
        lastExecTime = Date.now();
        timeoutId = null;
      }, delay - timeSinceLastExec);
    }
  });
  throttledFunc.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
  return throttledFunc;
}
function createElementCache(query, ttl = 1e3) {
  let cache = null;
  let lastCacheTime = 0;
  return () => {
    const now = Date.now();
    if (!cache || now - lastCacheTime > ttl) {
      cache = document.querySelectorAll(query);
      lastCacheTime = now;
    }
    return cache;
  };
}
var debug = createScopedLogger("stega:clean");
function decodeStega(str) {
  if (!str) return null;
  try {
    const decoded = X(str);
    if (decoded?.href) {
      return decoded;
    }
  } catch (error) {
    debug.log("error decoding stega data", error);
    const match = str.match(/{"origin.*?}/);
    if (match) {
      try {
        const decodedMatch = X(
          match[0]
        );
        if (decodedMatch?.href) {
          return decodedMatch;
        }
      } catch (innerError) {
        debug.log("error decoding stega regex match", innerError);
      }
    }
  }
  return null;
}
var IGNORED_ANCESTORS = "script, style, noscript";
function isIgnoredTextNode(node) {
  if (node.parentElement?.closest(IGNORED_ANCESTORS)) return true;
  return !node.textContent?.trim();
}
function walkTextNodes(root, visit) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node2) => isIgnoredTextNode(node2) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
  });
  let node;
  while (node = walker.nextNode()) {
    visit(node);
  }
}
function tagEncodedElement(element, decoded) {
  element.setAttribute("data-prepr-encoded", "");
  element.setAttribute("data-prepr-href", decoded.href);
  element.setAttribute("data-prepr-origin", decoded.origin);
}
var debug2 = createScopedLogger("stega:elements");
var StegaElements = class {
  constructor(decode = decodeStega) {
    this.observer = null;
    this.decode = decode;
  }
  getElements() {
    if (!this.elements) {
      this.elements = document.querySelectorAll("[data-prepr-encoded]");
    }
    return this.elements;
  }
  /** Returns true only when this tags an element that wasn't tagged before. */
  tagFromTextNode(node) {
    const decoded = this.decode(node.textContent);
    if (!decoded?.href) return false;
    const target = node.parentElement;
    if (!target || target.hasAttribute("data-prepr-encoded")) return false;
    tagEncodedElement(target, decoded);
    return true;
  }
  scanNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (isIgnoredTextNode(node)) return;
      this.tagFromTextNode(node);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      node.childNodes.forEach((child) => this.scanNode(child));
    }
  }
  /**
   * `skipIfTagged` reuses whatever the auto-clean pass already tagged instead
   * of re-walking the body.
   */
  scanDocument(skipIfTagged = false) {
    if (skipIfTagged) {
      const existing = document.querySelectorAll("[data-prepr-encoded]");
      if (existing.length > 0) {
        this.elements = existing;
        return;
      }
    }
    let encodedCount = 0;
    walkTextNodes(document.body, (textNode) => {
      if (this.tagFromTextNode(textNode)) encodedCount++;
    });
    debug2.log("document scan complete, encoded", encodedCount, "elements");
    this.elements = document.querySelectorAll("[data-prepr-encoded]");
  }
  /** `onUpdate` fires after each debounced batch, for refreshing derived state. */
  setupMutationObserver(onUpdate) {
    if (this.observer) {
      this.observer.disconnect();
    }
    let pending = [];
    let debounceTimeout = null;
    const processMutations = () => {
      const addedNodes = /* @__PURE__ */ new Set();
      pending.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => addedNodes.add(node));
        if (mutation.type === "characterData") {
          addedNodes.add(mutation.target);
        }
      });
      addedNodes.forEach((node) => this.scanNode(node));
      pending = [];
      this.elements = document.querySelectorAll("[data-prepr-encoded]");
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
      characterData: true
    });
  }
  /** Drops the active class but keeps the data attributes, unlike cleanup(). */
  cleanupVisuals() {
    document.querySelectorAll(".prepr-overlay-active").forEach((element) => element.classList.remove("prepr-overlay-active"));
  }
  cleanup() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    document.querySelectorAll("[data-prepr-encoded]").forEach((element) => {
      element.removeAttribute("data-prepr-encoded");
      element.removeAttribute("data-prepr-href");
      element.removeAttribute("data-prepr-origin");
      element.classList.remove("prepr-overlay-active");
    });
    this.elements = void 0;
  }
};
var debug3 = createScopedLogger("stega:overlay");
var StegaOverlay = class {
  constructor(onEdit) {
    this.overlay = null;
    this.tooltip = null;
    this.hideTimeout = null;
    this.currentElement = null;
    this.onEdit = onEdit;
  }
  create() {
    const overlay = document.createElement("div");
    overlay.className = "prepr-overlay";
    overlay.style.display = "none";
    const tooltip = document.createElement("div");
    tooltip.className = "prepr-tooltip";
    tooltip.style.display = "none";
    document.body.appendChild(overlay);
    document.body.appendChild(tooltip);
    this.overlay = overlay;
    this.tooltip = tooltip;
    return { overlay, tooltip };
  }
  getTooltip() {
    return this.tooltip;
  }
  hasCurrentElement() {
    return this.currentElement !== null;
  }
  clearHideTimeout() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }
  show(element) {
    if (!this.overlay || !this.tooltip) return;
    this.clearHideTimeout();
    if (this.currentElement && this.currentElement !== element) {
      this.currentElement.classList.remove("prepr-overlay-active");
    }
    const rect = element.getBoundingClientRect();
    const href = element.getAttribute("data-prepr-href");
    const origin = element.getAttribute("data-prepr-origin");
    const id = element.getAttribute("data-prepr-id") ?? void 0;
    const field = element.getAttribute("data-prepr-field") ?? void 0;
    debug3.log("showing overlay", { href, origin });
    const overlay = this.overlay;
    overlay.style.display = "block";
    overlay.style.top = `${rect.top + window.scrollY - 2}px`;
    overlay.style.left = `${rect.left + window.scrollX - 4}px`;
    overlay.style.width = `${rect.width + 8}px`;
    overlay.style.height = `${rect.height + 4}px`;
    const tooltip = this.tooltip;
    if (href && origin) {
      const MIN_WIDTH_FOR_TEXT = 80;
      const isCompact = rect.width < MIN_WIDTH_FOR_TEXT;
      tooltip.textContent = isCompact ? "\u2197" : `${origin} \u2197`;
      tooltip.style.display = "block";
      tooltip.style.minWidth = isCompact ? "auto" : "80px";
      requestAnimationFrame(() => {
        let top = rect.top + window.scrollY - tooltip.clientHeight - 2;
        let left = rect.right + 4 - tooltip.clientWidth;
        const minTop = window.scrollY + 4;
        const maxTop = window.scrollY + window.innerHeight - tooltip.clientHeight - 4;
        const minLeft = window.scrollX + 4;
        const maxLeft = window.scrollX + window.innerWidth - tooltip.clientWidth - 4;
        if (top < minTop) {
          top = rect.bottom + window.scrollY + 2;
        }
        top = Math.max(minTop, Math.min(top, maxTop));
        left = Math.max(minLeft, Math.min(left, maxLeft));
        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
      });
      tooltip.onclick = () => {
        this.onEdit({ href, origin, id, field });
      };
    }
    this.currentElement = element;
    element.classList.add("prepr-overlay-active");
  }
  hideImmediate() {
    this.clearHideTimeout();
    if (this.overlay) this.overlay.style.display = "none";
    if (this.tooltip) this.tooltip.style.display = "none";
    if (this.currentElement) {
      this.currentElement.classList.remove("prepr-overlay-active");
      this.currentElement = null;
    }
  }
  hide() {
    if (!this.overlay || !this.tooltip) return;
    this.clearHideTimeout();
    this.hideTimeout = setTimeout(() => this.hideImmediate(), 100);
  }
  cleanup() {
    this.clearHideTimeout();
    if (this.overlay) {
      this.overlay.style.display = "none";
      this.overlay.parentNode?.removeChild(this.overlay);
      this.overlay = null;
    }
    if (this.tooltip) {
      this.tooltip.style.display = "none";
      this.tooltip.parentNode?.removeChild(this.tooltip);
      this.tooltip = null;
    }
    if (this.currentElement) {
      this.currentElement.classList.remove("prepr-overlay-active");
      this.currentElement = null;
    }
  }
};
var debug4 = createScopedLogger("stega:proximity");
var StegaProximity = class {
  constructor() {
    this.highlighted = /* @__PURE__ */ new Set();
    this.visible = /* @__PURE__ */ new Set();
    this.observer = null;
    this.getEncodedElements = createElementCache(
      "[data-prepr-encoded]",
      200
    );
  }
  /** Call after the encoded element set changes — rebuilds the observer. */
  refreshObserving() {
    try {
      if (typeof IntersectionObserver === "undefined") return;
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      this.visible = /* @__PURE__ */ new Set();
      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const el = entry.target;
            if (entry.isIntersecting) {
              this.visible.add(el);
            } else {
              this.visible.delete(el);
            }
          });
        },
        { root: null, rootMargin: "0px", threshold: 0 }
      );
      const nodes = this.getEncodedElements();
      nodes.forEach((el) => this.observer.observe(el));
      debug4.log("observing", nodes.length, "encoded elements");
    } catch (error) {
      debug4.log("error setting up IntersectionObserver", error);
    }
  }
  stopObserving() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
      this.visible.clear();
    }
  }
  updateElementGradients(cursorX, cursorY) {
    const candidates = this.visible.size > 0 ? Array.from(this.visible) : Array.from(this.getEncodedElements());
    const newHighlighted = /* @__PURE__ */ new Set();
    candidates.forEach((element) => {
      const rect = element.getBoundingClientRect();
      const distance = Math.min(
        Math.abs(cursorX - rect.left),
        Math.abs(cursorX - rect.right),
        Math.abs(cursorY - rect.top),
        Math.abs(cursorY - rect.bottom)
      );
      if (distance < 150) {
        const relativeX = cursorX - rect.left;
        const relativeY = cursorY - rect.top;
        element.style.setProperty("--cursor-x", `${relativeX}px`);
        element.style.setProperty("--cursor-y", `${relativeY}px`);
        const baseGradientSize = Math.max(
          150,
          Math.max(rect.width, rect.height) * 1.1
        );
        const distanceScale = Math.max(0, (400 - distance) / 400);
        const gradientSize = baseGradientSize * distanceScale;
        element.style.setProperty("--gradient-size", `${gradientSize}px`);
        element.classList.add("prepr-proximity-highlight");
        newHighlighted.add(element);
      } else {
        element.classList.remove("prepr-proximity-highlight");
      }
    });
    this.highlighted = newHighlighted;
  }
  clearAllHighlights() {
    this.highlighted.forEach(
      (element) => element.classList.remove("prepr-proximity-highlight")
    );
    this.highlighted.clear();
  }
};
var STEGA_STYLES = '[data-prepr-encoded]{position:relative}.prepr-overlay{pointer-events:none;z-index:10000;border:2px solid #4f46e5;border-radius:4px 0 4px 4px;transition:all .2s ease-in-out;position:absolute}.prepr-tooltip{color:#fff;white-space:nowrap;z-index:10001;text-align:center;pointer-events:auto;cursor:pointer;background-color:#4f46e5;border-radius:4px 4px 0 0;min-width:80px;padding:4px 8px;font-size:12px;line-height:1;transition:opacity .2s ease-in-out;position:absolute}.prepr-tooltip:hover{background-color:#4338ca}.prepr-proximity-highlight{z-index:1;position:relative}.prepr-proximity-highlight,.prepr-proximity-highlight *{overflow:visible!important}.prepr-proximity-highlight:before{content:"";pointer-events:none;background:radial-gradient(circle var(--gradient-size) at var(--cursor-x) var(--cursor-y), #4f46e526 0%, #2563eb00 70%);z-index:9999;border:2px solid #4f46e526;border-radius:4px;transition:all .2s;position:absolute;top:-2px;bottom:-2px;left:-4px;right:-4px;overflow:visible}';
var STEGA_STYLE_MARKER = "data-prepr-stega";
function injectStegaStyles(css = STEGA_STYLES) {
  const existing = document.querySelector(
    `style[${STEGA_STYLE_MARKER}]`
  );
  if (existing) return existing;
  const style = document.createElement("style");
  style.setAttribute(STEGA_STYLE_MARKER, "");
  style.textContent = css;
  document.head.appendChild(style);
  return style;
}
function removeStegaStyles() {
  document.querySelectorAll(`style[${STEGA_STYLE_MARKER}]`).forEach((node) => node.parentNode?.removeChild(node));
}
var debug5 = createScopedLogger("stega:scan");
var EDITOR_MODE_STYLES = "[data-prepr-encoded]{cursor:pointer}";
function createStegaController(opts) {
  const tooltipEnabled = opts.tooltip ?? true;
  const overlay = new StegaOverlay(opts.onEdit);
  const proximity = new StegaProximity();
  const elements = new StegaElements();
  let initialized = false;
  let throttledMouseMove = null;
  const handleTooltipMouseEnter = () => {
    overlay.clearHideTimeout();
  };
  const handleTooltipMouseLeave = () => {
    if (!overlay.hasCurrentElement()) {
      overlay.hide();
    }
  };
  const handleScroll = () => {
    overlay.hideImmediate();
    proximity.clearAllHighlights();
  };
  const handleClick = (e2) => {
    const target = e2.target;
    const encoded = target?.closest(
      "[data-prepr-encoded]"
    );
    if (!encoded) return;
    e2.preventDefault();
    e2.stopPropagation();
    opts.onEdit({
      href: encoded.getAttribute("data-prepr-href") ?? "",
      origin: encoded.getAttribute("data-prepr-origin") ?? "",
      id: encoded.getAttribute("data-prepr-id") ?? void 0,
      field: encoded.getAttribute("data-prepr-field") ?? void 0
    });
  };
  const start = () => {
    if (initialized) {
      debug5.log("already initialized, skipping setup");
      return;
    }
    if (!tooltipEnabled) {
      injectStegaStyles(EDITOR_MODE_STYLES);
      elements.scanDocument(true);
      elements.setupMutationObserver(() => {
      });
      document.addEventListener("click", handleClick, { capture: true });
      initialized = true;
      debug5.log("stega controller started (editor mode)");
      return;
    }
    injectStegaStyles();
    const { tooltip } = overlay.create();
    tooltip.addEventListener("mouseenter", handleTooltipMouseEnter);
    tooltip.addEventListener("mouseleave", handleTooltipMouseLeave);
    elements.scanDocument(true);
    proximity.refreshObserving();
    elements.setupMutationObserver(() => proximity.refreshObserving());
    throttledMouseMove = throttle((e2) => {
      const mouseEvent = e2;
      const target = mouseEvent.target;
      if (!target) return;
      if (target.closest(".prepr-tooltip")) return;
      proximity.updateElementGradients(mouseEvent.clientX, mouseEvent.clientY);
      const encoded = target.closest("[data-prepr-encoded]");
      if (encoded) {
        overlay.show(encoded);
      } else {
        overlay.hide();
      }
    }, 16);
    document.addEventListener("mousemove", throttledMouseMove);
    window.addEventListener("scroll", handleScroll, { capture: true });
    initialized = true;
    debug5.log("stega controller started");
  };
  const stop = () => {
    if (!initialized) return;
    if (!tooltipEnabled) {
      document.removeEventListener("click", handleClick, { capture: true });
      elements.cleanup();
      removeStegaStyles();
      initialized = false;
      debug5.log("stega controller stopped (editor mode)");
      return;
    }
    if (throttledMouseMove) {
      document.removeEventListener("mousemove", throttledMouseMove);
      throttledMouseMove.cancel();
      throttledMouseMove = null;
    }
    window.removeEventListener("scroll", handleScroll, { capture: true });
    const tooltip = overlay.getTooltip();
    if (tooltip) {
      tooltip.removeEventListener("mouseenter", handleTooltipMouseEnter);
      tooltip.removeEventListener("mouseleave", handleTooltipMouseLeave);
    }
    overlay.cleanup();
    proximity.clearAllHighlights();
    proximity.stopObserving();
    elements.cleanup();
    removeStegaStyles();
    initialized = false;
    debug5.log("stega controller stopped");
  };
  return { start, stop };
}
var debug6 = createScopedLogger("stega:auto-clean");
function createStegaAutoClean() {
  let observer = null;
  let processing = false;
  let cleaned = /* @__PURE__ */ new WeakMap();
  let debounceTimeout = null;
  function cleanTextNode(textNode) {
    if (isIgnoredTextNode(textNode)) return false;
    const textContent = textNode.textContent;
    const info = cleaned.get(textNode);
    if (info && textContent === info.cleaned) return false;
    try {
      const { cleaned: stripped, encoded } = P(textContent);
      if (!encoded || stripped === textContent) return false;
      const decoded = decodeStega(textContent);
      if (!decoded?.href) return false;
      cleaned.set(textNode, { original: textContent, cleaned: stripped });
      textNode.textContent = stripped;
      let target = textNode.parentElement;
      const editTargetParent = textNode.parentElement?.closest(
        "[data-prepr-edit-target]"
      );
      if (editTargetParent) target = editTargetParent;
      if (target) {
        tagEncodedElement(target, decoded);
        return true;
      }
    } catch (error) {
      debug6.log("error cleaning text node", error);
    }
    return false;
  }
  function scanAndClean() {
    processing = true;
    walkTextNodes(document.body, cleanTextNode);
    processing = false;
  }
  function collectAffected(mutations) {
    const affected = /* @__PURE__ */ new Set();
    mutations.forEach((mutation) => {
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            affected.add(node);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            walkTextNodes(node, (textNode) => affected.add(textNode));
          }
        });
      }
      if (mutation.type === "characterData" && mutation.target.nodeType === Node.TEXT_NODE) {
        const textNode = mutation.target;
        const info = cleaned.get(textNode);
        if (info && textNode.textContent === info.original) {
          affected.add(textNode);
        }
      }
    });
    return affected;
  }
  function handleMutations(mutations) {
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
  function setupObserver() {
    observer = new MutationObserver(handleMutations);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
  function start() {
    if (observer || typeof window === "undefined") return;
    const run = () => {
      scanAndClean();
      setupObserver();
    };
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(run);
    } else {
      setTimeout(run, 0);
    }
    debug6.log("stega auto-clean started");
  }
  function stop() {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      debounceTimeout = null;
    }
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    cleaned = /* @__PURE__ */ new WeakMap();
    debug6.log("stega auto-clean stopped");
  }
  return { start, stop };
}
var DEFAULT_STATE = {
  locale: "en",
  segments: [],
  selectedSegment: null,
  selectedVariant: null,
  editMode: false,
  previewMode: false,
  toolbarOpen: false,
  isIframe: false
};
function createToolbarStore(initial = {}) {
  let state = { ...DEFAULT_STATE, ...initial };
  const listeners = /* @__PURE__ */ new Set();
  function get() {
    return state;
  }
  function set(patch) {
    const keys = Object.keys(patch);
    const hasChange = keys.some((key) => patch[key] !== state[key]);
    if (!hasChange) return;
    state = { ...state, ...patch };
    for (const listener of listeners) {
      listener(state);
    }
  }
  function subscribe(fn) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }
  return { get, set, subscribe };
}
var n;
var l2;
var u2;
var t;
var i;
var r;
var o;
var e;
var f;
var c;
var a;
var s;
var h2;
var p2;
var v;
var y;
var d2 = {};
var w2 = [];
var _2 = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i;
var g2 = Array.isArray;
function m2(n2, l22) {
  for (var u3 in l22) n2[u3] = l22[u3];
  return n2;
}
function b(n2) {
  n2 && n2.parentNode && n2.parentNode.removeChild(n2);
}
function k(l22, u3, t3) {
  var i2, r2, o2, e2 = {};
  for (o2 in u3) "key" == o2 ? i2 = u3[o2] : "ref" == o2 ? r2 = u3[o2] : e2[o2] = u3[o2];
  if (arguments.length > 2 && (e2.children = arguments.length > 3 ? n.call(arguments, 2) : t3), "function" == typeof l22 && null != l22.defaultProps) for (o2 in l22.defaultProps) void 0 === e2[o2] && (e2[o2] = l22.defaultProps[o2]);
  return x2(l22, e2, i2, r2, null);
}
function x2(n2, t3, i2, r2, o2) {
  var e2 = { type: n2, props: t3, key: i2, ref: r2, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: void 0, __v: null == o2 ? ++u2 : o2, __i: -1, __u: 0 };
  return null == o2 && null != l2.vnode && l2.vnode(e2), e2;
}
function S(n2) {
  return n2.children;
}
function C(n2, l22) {
  this.props = n2, this.context = l22;
}
function $(n2, l22) {
  if (null == l22) return n2.__ ? $(n2.__, n2.__i + 1) : null;
  for (var u3; l22 < n2.__k.length; l22++) if (null != (u3 = n2.__k[l22]) && null != u3.__e) return u3.__e;
  return "function" == typeof n2.type ? $(n2) : null;
}
function I(n2) {
  if (n2.__P && n2.__d) {
    var u3 = n2.__v, t3 = u3.__e, i2 = [], r2 = [], o2 = m2({}, u3);
    o2.__v = u3.__v + 1, l2.vnode && l2.vnode(o2), q(n2.__P, o2, u3, n2.__n, n2.__P.namespaceURI, 32 & u3.__u ? [t3] : null, i2, null == t3 ? $(u3) : t3, !!(32 & u3.__u), r2), o2.__v = u3.__v, o2.__.__k[o2.__i] = o2, D(i2, o2, r2), u3.__e = u3.__ = null, o2.__e != t3 && P2(o2);
  }
}
function P2(n2) {
  if (null != (n2 = n2.__) && null != n2.__c) return n2.__e = n2.__c.base = null, n2.__k.some(function(l22) {
    if (null != l22 && null != l22.__e) return n2.__e = n2.__c.base = l22.__e;
  }), P2(n2);
}
function A(n2) {
  (!n2.__d && (n2.__d = true) && i.push(n2) && !H.__r++ || r != l2.debounceRendering) && ((r = l2.debounceRendering) || o)(H);
}
function H() {
  try {
    for (var n2, l22 = 1; i.length; ) i.length > l22 && i.sort(e), n2 = i.shift(), l22 = i.length, I(n2);
  } finally {
    i.length = H.__r = 0;
  }
}
function L(n2, l22, u3, t3, i2, r2, o2, e2, f3, c2, a2) {
  var s2, h22, p22, v2, y2, _22, g22, m22 = t3 && t3.__k || w2, b2 = l22.length;
  for (f3 = T2(u3, l22, m22, f3, b2), s2 = 0; s2 < b2; s2++) null != (p22 = u3.__k[s2]) && (h22 = -1 != p22.__i && m22[p22.__i] || d2, p22.__i = s2, _22 = q(n2, p22, h22, i2, r2, o2, e2, f3, c2, a2), v2 = p22.__e, p22.ref && h22.ref != p22.ref && (h22.ref && J(h22.ref, null, p22), a2.push(p22.ref, p22.__c || v2, p22)), null == y2 && null != v2 && (y2 = v2), (g22 = !!(4 & p22.__u)) || h22.__k === p22.__k ? (f3 = j(p22, f3, n2, g22), g22 && h22.__e && (h22.__e = null)) : "function" == typeof p22.type && void 0 !== _22 ? f3 = _22 : v2 && (f3 = v2.nextSibling), p22.__u &= -7);
  return u3.__e = y2, f3;
}
function T2(n2, l22, u3, t3, i2) {
  var r2, o2, e2, f3, c2, a2 = u3.length, s2 = a2, h22 = 0;
  for (n2.__k = new Array(i2), r2 = 0; r2 < i2; r2++) null != (o2 = l22[r2]) && "boolean" != typeof o2 && "function" != typeof o2 ? ("string" == typeof o2 || "number" == typeof o2 || "bigint" == typeof o2 || o2.constructor == String ? o2 = n2.__k[r2] = x2(null, o2, null, null, null) : g2(o2) ? o2 = n2.__k[r2] = x2(S, { children: o2 }, null, null, null) : void 0 === o2.constructor && o2.__b > 0 ? o2 = n2.__k[r2] = x2(o2.type, o2.props, o2.key, o2.ref ? o2.ref : null, o2.__v) : n2.__k[r2] = o2, f3 = r2 + h22, o2.__ = n2, o2.__b = n2.__b + 1, e2 = null, -1 != (c2 = o2.__i = O(o2, u3, f3, s2)) && (s2--, (e2 = u3[c2]) && (e2.__u |= 2)), null == e2 || null == e2.__v ? (-1 == c2 && (i2 > a2 ? h22-- : i2 < a2 && h22++), "function" != typeof o2.type && (o2.__u |= 4)) : c2 != f3 && (c2 == f3 - 1 ? h22-- : c2 == f3 + 1 ? h22++ : (c2 > f3 ? h22-- : h22++, o2.__u |= 4))) : n2.__k[r2] = null;
  if (s2) for (r2 = 0; r2 < a2; r2++) null != (e2 = u3[r2]) && 0 == (2 & e2.__u) && (e2.__e == t3 && (t3 = $(e2)), K(e2, e2));
  return t3;
}
function j(n2, l22, u3, t3) {
  var i2, r2;
  if ("function" == typeof n2.type) {
    for (i2 = n2.__k, r2 = 0; i2 && r2 < i2.length; r2++) i2[r2] && (i2[r2].__ = n2, l22 = j(i2[r2], l22, u3, t3));
    return l22;
  }
  n2.__e != l22 && (t3 && (l22 && n2.type && !l22.parentNode && (l22 = $(n2)), u3.insertBefore(n2.__e, l22 || null)), l22 = n2.__e);
  do {
    l22 = l22 && l22.nextSibling;
  } while (null != l22 && 8 == l22.nodeType);
  return l22;
}
function O(n2, l22, u3, t3) {
  var i2, r2, o2, e2 = n2.key, f3 = n2.type, c2 = l22[u3], a2 = null != c2 && 0 == (2 & c2.__u);
  if (null === c2 && null == e2 || a2 && e2 == c2.key && f3 == c2.type) return u3;
  if (t3 > (a2 ? 1 : 0)) {
    for (i2 = u3 - 1, r2 = u3 + 1; i2 >= 0 || r2 < l22.length; ) if (null != (c2 = l22[o2 = i2 >= 0 ? i2-- : r2++]) && 0 == (2 & c2.__u) && e2 == c2.key && f3 == c2.type) return o2;
  }
  return -1;
}
function z(n2, l22, u3) {
  "-" == l22[0] ? n2.setProperty(l22, null == u3 ? "" : u3) : n2[l22] = null == u3 ? "" : "number" != typeof u3 || _2.test(l22) ? u3 : u3 + "px";
}
function N(n2, l22, u3, t3, i2) {
  var r2, o2;
  n: if ("style" == l22) if ("string" == typeof u3) n2.style.cssText = u3;
  else {
    if ("string" == typeof t3 && (n2.style.cssText = t3 = ""), t3) for (l22 in t3) u3 && l22 in u3 || z(n2.style, l22, "");
    if (u3) for (l22 in u3) t3 && u3[l22] == t3[l22] || z(n2.style, l22, u3[l22]);
  }
  else if ("o" == l22[0] && "n" == l22[1]) r2 = l22 != (l22 = l22.replace(s, "$1")), o2 = l22.toLowerCase(), l22 = o2 in n2 || "onFocusOut" == l22 || "onFocusIn" == l22 ? o2.slice(2) : l22.slice(2), n2.l || (n2.l = {}), n2.l[l22 + r2] = u3, u3 ? t3 ? u3[a] = t3[a] : (u3[a] = h2, n2.addEventListener(l22, r2 ? v : p2, r2)) : n2.removeEventListener(l22, r2 ? v : p2, r2);
  else {
    if ("http://www.w3.org/2000/svg" == i2) l22 = l22.replace(/xlink(H|:h)/, "h").replace(/sName$/, "s");
    else if ("width" != l22 && "height" != l22 && "href" != l22 && "list" != l22 && "form" != l22 && "tabIndex" != l22 && "download" != l22 && "rowSpan" != l22 && "colSpan" != l22 && "role" != l22 && "popover" != l22 && l22 in n2) try {
      n2[l22] = null == u3 ? "" : u3;
      break n;
    } catch (n3) {
    }
    "function" == typeof u3 || (null == u3 || false === u3 && "-" != l22[4] ? n2.removeAttribute(l22) : n2.setAttribute(l22, "popover" == l22 && 1 == u3 ? "" : u3));
  }
}
function V(n2) {
  return function(u3) {
    if (this.l) {
      var t3 = this.l[u3.type + n2];
      if (null == u3[c]) u3[c] = h2++;
      else if (u3[c] < t3[a]) return;
      return t3(l2.event ? l2.event(u3) : u3);
    }
  };
}
function q(n2, u3, t3, i2, r2, o2, e2, f3, c2, a2) {
  var s2, h22, p22, v2, y2, d22, _22, k2, x22, M, $2, I2, P22, A2, H2, T22, j2 = u3.type;
  if (void 0 !== u3.constructor) return null;
  128 & t3.__u && (c2 = !!(32 & t3.__u), o2 = [f3 = u3.__e = t3.__e]), (s2 = l2.__b) && s2(u3);
  n: if ("function" == typeof j2) {
    h22 = e2.length;
    try {
      if (x22 = u3.props, M = j2.prototype && j2.prototype.render, $2 = (s2 = j2.contextType) && i2[s2.__c], I2 = s2 ? $2 ? $2.props.value : s2.__ : i2, t3.__c ? k2 = (p22 = u3.__c = t3.__c).__ = p22.__E : (M ? u3.__c = p22 = new j2(x22, I2) : (u3.__c = p22 = new C(x22, I2), p22.constructor = j2, p22.render = Q), $2 && $2.sub(p22), p22.state || (p22.state = {}), p22.__n = i2, v2 = p22.__d = true, p22.__h = [], p22._sb = []), M && null == p22.__s && (p22.__s = p22.state), M && null != j2.getDerivedStateFromProps && (p22.__s == p22.state && (p22.__s = m2({}, p22.__s)), m2(p22.__s, j2.getDerivedStateFromProps(x22, p22.__s))), y2 = p22.props, d22 = p22.state, p22.__v = u3, v2) M && null == j2.getDerivedStateFromProps && null != p22.componentWillMount && p22.componentWillMount(), M && null != p22.componentDidMount && p22.__h.push(p22.componentDidMount);
      else {
        if (M && null == j2.getDerivedStateFromProps && x22 !== y2 && null != p22.componentWillReceiveProps && p22.componentWillReceiveProps(x22, I2), u3.__v == t3.__v || !p22.__e && null != p22.shouldComponentUpdate && false === p22.shouldComponentUpdate(x22, p22.__s, I2)) {
          u3.__v != t3.__v && (p22.props = x22, p22.state = p22.__s, p22.__d = false), u3.__e = t3.__e, u3.__k = t3.__k, u3.__k.some(function(n3) {
            n3 && (n3.__ = u3);
          }), w2.push.apply(p22.__h, p22._sb), p22._sb = [], p22.__h.length && e2.push(p22);
          break n;
        }
        null != p22.componentWillUpdate && p22.componentWillUpdate(x22, p22.__s, I2), M && null != p22.componentDidUpdate && p22.__h.push(function() {
          p22.componentDidUpdate(y2, d22, _22);
        });
      }
      if (p22.context = I2, p22.props = x22, p22.__P = n2, p22.__e = false, P22 = l2.__r, A2 = 0, M) p22.state = p22.__s, p22.__d = false, P22 && P22(u3), s2 = p22.render(p22.props, p22.state, p22.context), w2.push.apply(p22.__h, p22._sb), p22._sb = [];
      else do {
        p22.__d = false, P22 && P22(u3), s2 = p22.render(p22.props, p22.state, p22.context), p22.state = p22.__s;
      } while (p22.__d && ++A2 < 25);
      p22.state = p22.__s, null != p22.getChildContext && (i2 = m2(m2({}, i2), p22.getChildContext())), M && !v2 && null != p22.getSnapshotBeforeUpdate && (_22 = p22.getSnapshotBeforeUpdate(y2, d22)), H2 = null != s2 && s2.type === S && null == s2.key ? E2(s2.props.children) : s2, f3 = L(n2, g2(H2) ? H2 : [H2], u3, t3, i2, r2, o2, e2, f3, c2, a2), p22.base = u3.__e, u3.__u &= -161, p22.__h.length && e2.push(p22), k2 && (p22.__E = p22.__ = null);
    } catch (n3) {
      if (e2.length = h22, u3.__v = null, c2 || null != o2) {
        if (n3.then) {
          for (u3.__u |= c2 ? 160 : 128; f3 && 8 == f3.nodeType && f3.nextSibling; ) f3 = f3.nextSibling;
          null != o2 && (o2[o2.indexOf(f3)] = null), u3.__e = f3;
        } else if (null != o2) for (T22 = o2.length; T22--; ) b(o2[T22]);
      } else u3.__e = t3.__e;
      null == u3.__k && (u3.__k = t3.__k || []), n3.then || B(u3), l2.__e(n3, u3, t3);
    }
  } else null == o2 && u3.__v == t3.__v ? (u3.__k = t3.__k, u3.__e = t3.__e) : f3 = u3.__e = G(t3.__e, u3, t3, i2, r2, o2, e2, c2, a2);
  return (s2 = l2.diffed) && s2(u3), 128 & u3.__u ? void 0 : f3;
}
function B(n2) {
  n2 && (n2.__c && (n2.__c.__e = true), n2.__k && n2.__k.some(B));
}
function D(n2, u3, t3) {
  for (var i2 = 0; i2 < t3.length; i2++) J(t3[i2], t3[++i2], t3[++i2]);
  l2.__c && l2.__c(u3, n2), n2.some(function(u4) {
    try {
      n2 = u4.__h, u4.__h = [], n2.some(function(n3) {
        n3.call(u4);
      });
    } catch (n3) {
      l2.__e(n3, u4.__v);
    }
  });
}
function E2(n2) {
  return "object" != typeof n2 || null == n2 || n2.__b > 0 ? n2 : g2(n2) ? n2.map(E2) : void 0 !== n2.constructor ? null : m2({}, n2);
}
function G(u3, t3, i2, r2, o2, e2, f3, c2, a2) {
  var s2, h22, p22, v2, y2, w22, _22, m22 = i2.props || d2, k2 = t3.props, x22 = t3.type;
  if ("svg" == x22 ? o2 = "http://www.w3.org/2000/svg" : "math" == x22 ? o2 = "http://www.w3.org/1998/Math/MathML" : o2 || (o2 = "http://www.w3.org/1999/xhtml"), null != e2) {
    for (s2 = 0; s2 < e2.length; s2++) if ((y2 = e2[s2]) && "setAttribute" in y2 == !!x22 && (x22 ? y2.localName == x22 : 3 == y2.nodeType)) {
      u3 = y2, e2[s2] = null;
      break;
    }
  }
  if (null == u3) {
    if (null == x22) return document.createTextNode(k2);
    u3 = document.createElementNS(o2, x22, k2.is && k2), c2 && (l2.__m && l2.__m(t3, e2), c2 = false), e2 = null;
  }
  if (null == x22) m22 === k2 || c2 && u3.data == k2 || (u3.data = k2);
  else {
    if (e2 = "textarea" == x22 && null != k2.defaultValue ? null : e2 && n.call(u3.childNodes), !c2 && null != e2) for (m22 = {}, s2 = 0; s2 < u3.attributes.length; s2++) m22[(y2 = u3.attributes[s2]).name] = y2.value;
    for (s2 in m22) y2 = m22[s2], "dangerouslySetInnerHTML" == s2 ? p22 = y2 : "children" == s2 || s2 in k2 || "value" == s2 && "defaultValue" in k2 || "checked" == s2 && "defaultChecked" in k2 || N(u3, s2, null, y2, o2);
    for (s2 in k2) y2 = k2[s2], "children" == s2 ? v2 = y2 : "dangerouslySetInnerHTML" == s2 ? h22 = y2 : "value" == s2 ? w22 = y2 : "checked" == s2 ? _22 = y2 : c2 && "function" != typeof y2 || m22[s2] === y2 || N(u3, s2, y2, m22[s2], o2);
    if (h22) c2 || p22 && (h22.__html == p22.__html || h22.__html == u3.innerHTML) || (u3.innerHTML = h22.__html), t3.__k = [];
    else if (p22 && (u3.innerHTML = ""), L("template" == t3.type ? u3.content : u3, g2(v2) ? v2 : [v2], t3, i2, r2, "foreignObject" == x22 ? "http://www.w3.org/1999/xhtml" : o2, e2, f3, e2 ? e2[0] : i2.__k && $(i2, 0), c2, a2), null != e2) for (s2 = e2.length; s2--; ) b(e2[s2]);
    c2 && "textarea" != x22 || (s2 = "value", "progress" == x22 && null == w22 ? u3.removeAttribute("value") : null != w22 && (w22 !== u3[s2] || "progress" == x22 && !w22 || "option" == x22 && w22 != m22[s2]) && N(u3, s2, w22, m22[s2], o2), s2 = "checked", null != _22 && _22 != u3[s2] && N(u3, s2, _22, m22[s2], o2));
  }
  return u3;
}
function J(n2, u3, t3) {
  try {
    if ("function" == typeof n2) {
      var i2 = "function" == typeof n2.__u;
      i2 && n2.__u(), i2 && null == u3 || (n2.__u = n2(u3));
    } else n2.current = u3;
  } catch (n3) {
    l2.__e(n3, t3);
  }
}
function K(n2, u3, t3) {
  var i2, r2;
  if (l2.unmount && l2.unmount(n2), (i2 = n2.ref) && (i2.current && i2.current != n2.__e || J(i2, null, u3)), null != (i2 = n2.__c)) {
    if (i2.componentWillUnmount) try {
      i2.componentWillUnmount();
    } catch (n3) {
      l2.__e(n3, u3);
    }
    i2.base = i2.__P = i2.__n = null;
  }
  if (i2 = n2.__k) for (r2 = 0; r2 < i2.length; r2++) i2[r2] && K(i2[r2], u3, t3 || "function" != typeof n2.type);
  t3 || b(n2.__e), n2.__c = n2.__ = n2.__e = void 0;
}
function Q(n2, l22, u3) {
  return this.constructor(n2, u3);
}
function R(u3, t3, i2) {
  var r2, o2, e2, f3;
  t3 == document && (t3 = document.documentElement), l2.__ && l2.__(u3, t3), o2 = (r2 = "function" == typeof i2) ? null : i2 && i2.__k || t3.__k, e2 = [], f3 = [], q(t3, u3 = (!r2 && i2 || t3).__k = k(S, null, [u3]), o2 || d2, d2, t3.namespaceURI, !r2 && i2 ? [i2] : o2 ? null : t3.firstChild ? n.call(t3.childNodes) : null, e2, !r2 && i2 ? i2 : o2 ? o2.__e : t3.firstChild, r2, f3), D(e2, u3, f3), u3.props.children = null;
}
n = w2.slice, l2 = { __e: function(n2, l22, u3, t3) {
  for (var i2, r2, o2; l22 = l22.__; ) if ((i2 = l22.__c) && !i2.__) try {
    if ((r2 = i2.constructor) && null != r2.getDerivedStateFromError && (i2.setState(r2.getDerivedStateFromError(n2)), o2 = i2.__d), null != i2.componentDidCatch && (i2.componentDidCatch(n2, t3 || {}), o2 = i2.__d), o2) return i2.__E = i2;
  } catch (l3) {
    n2 = l3;
  }
  throw n2;
} }, u2 = 0, t = function(n2) {
  return null != n2 && void 0 === n2.constructor;
}, C.prototype.setState = function(n2, l22) {
  var u3;
  u3 = null != this.__s && this.__s != this.state ? this.__s : this.__s = m2({}, this.state), "function" == typeof n2 && (n2 = n2(m2({}, u3), this.props)), n2 && m2(u3, n2), null != n2 && this.__v && (l22 && this._sb.push(l22), A(this));
}, C.prototype.forceUpdate = function(n2) {
  this.__v && (this.__e = true, n2 && this.__h.push(n2), A(this));
}, C.prototype.render = S, i = [], o = "function" == typeof Promise ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout, e = function(n2, l22) {
  return n2.__v.__b - l22.__v.__b;
}, H.__r = 0, f = Math.random().toString(8), c = "__d" + f, a = "__a" + f, s = /(PointerCapture)$|Capture$/i, h2 = 0, p2 = V(false), v = V(true), y = 0;
var LOGO_SVG = `<svg width="102" height="28" viewBox="0 0 102 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<path d="M39.2674 2.19699C39.2757 2.18321 39.2839 2.16943 39.291 2.15528L39.2939 2.15057L39.2935 2.1502C39.3379 2.06208 39.3633 1.96308 39.3633 1.85754C39.3633 1.62109 39.2374 1.41474 39.0507 1.30231C39.0485 1.30014 39.0467 1.29651 39.0446 1.29578C35.1089 -0.88088 29.8537 -0.36627 26.3741 3.2632C24.4207 5.3006 23.4231 7.92116 23.3716 10.5544H23.3684V20.893C23.3684 21.2495 23.6538 21.5389 24.0058 21.5389H26.98C27.332 21.5389 27.6174 21.2495 27.6174 20.893V10.7698H27.6192C27.6192 9.14658 28.2169 7.52187 29.4209 6.26599C31.5699 4.02478 34.7423 3.8565 36.9299 5.03659C36.9367 5.04058 36.9439 5.04384 36.9507 5.04747C36.9557 5.05001 36.9607 5.05254 36.9657 5.05508H36.9664C37.0494 5.09497 37.1417 5.11782 37.2393 5.11782C37.4879 5.11782 37.7032 4.97276 37.808 4.76206L39.2674 2.19699Z" fill="#4338CA"/>
<path d="M10.6216 0.000244141C4.75551 0.000244141 0 4.82177 0 10.7693V27.3543C0 27.7108 0.285079 28.0002 0.637405 28.0002H3.61161C3.96358 28.0002 4.24902 27.7108 4.24902 27.3543V19.3853C6.02424 20.7373 8.23084 21.5388 10.622 21.5388C16.4878 21.5388 21.244 16.7173 21.244 10.7697C21.2437 4.82177 16.4878 0.000244141 10.6216 0.000244141ZM10.6216 17.2311C7.10196 17.2311 4.24866 14.3382 4.24866 10.7693C4.24866 7.20079 7.10196 4.30788 10.6216 4.30788C14.1413 4.30788 16.995 7.20079 16.995 10.7693C16.995 14.3379 14.1413 17.2311 10.6216 17.2311Z" fill="#4338CA"/>
<path d="M73.259 0C67.3932 0 62.6373 4.82152 62.6373 10.7691V27.3541C62.6373 27.7106 62.9228 28 63.2747 28H66.2489C66.6009 28 66.8863 27.7106 66.8863 27.3541V19.3854C68.6616 20.7374 70.8682 21.5389 73.2593 21.5389C79.1251 21.5389 83.8813 16.7174 83.8813 10.7698C83.881 4.82152 79.1248 0 73.259 0ZM73.259 17.2309C69.7393 17.2309 66.886 14.338 66.886 10.7691C66.886 7.20055 69.7393 4.30764 73.259 4.30764C76.7783 4.30764 79.632 7.20055 79.632 10.7691C79.632 14.3376 76.7783 17.2309 73.259 17.2309Z" fill="#4338CA"/>
<path d="M60.439 10.9845C60.439 5.03657 55.6827 0 49.817 0C43.9508 0 39.1953 4.82152 39.1953 10.7691C39.1953 16.7167 43.9508 21.5382 49.817 21.5382C53.1374 21.5382 55.8763 19.9954 57.5939 18.1031C57.5939 18.1031 57.5942 18.1027 57.5946 18.1024C57.596 18.1009 57.5975 18.0995 57.5985 18.098C57.7112 17.9812 57.7806 17.822 57.7806 17.6461C57.7806 17.4601 57.7026 17.2929 57.5785 17.1751V17.1743L57.5696 17.1671C57.5535 17.1522 57.5367 17.1384 57.5188 17.1254L55.2464 15.2501C55.1344 15.1503 54.9877 15.0891 54.8264 15.0891C54.6261 15.0891 54.4476 15.183 54.331 15.3291C53.3216 16.3707 51.7256 17.2309 49.8166 17.2309C46.2969 17.2309 43.4436 14.338 43.4436 10.7691C43.4436 7.20055 46.2969 4.30764 49.8166 4.30764C52.5909 4.30764 54.9505 6.10605 55.8255 8.61527H50.3474C49.9954 8.61527 49.71 8.90467 49.71 9.26152V12.277C49.71 12.6339 49.9954 12.9233 50.3474 12.9233H59.5884C59.6059 12.9233 59.6227 12.9218 59.6399 12.9207C59.6571 12.9222 59.6742 12.9233 59.6914 12.9233C59.9743 12.9233 60.214 12.7361 60.2973 12.4772L60.3045 12.4783C60.308 12.4551 60.3116 12.4326 60.3152 12.4097C60.3199 12.3876 60.3234 12.3655 60.3256 12.3427C60.4003 11.861 60.439 11.5172 60.439 10.9845Z" fill="#4338CA"/>
<path d="M101.928 2.15406L101.931 2.14934L101.93 2.14898C101.974 2.06085 102 1.96185 102 1.85632C102 1.61987 101.874 1.41351 101.687 1.30109C101.685 1.29891 101.683 1.29529 101.681 1.29456C97.7455 -0.882101 92.4903 -0.367491 89.0107 3.26198C87.0573 5.29938 86.0597 7.91993 86.0082 10.5532H86.005V20.8918C86.005 21.2483 86.2904 21.5377 86.6424 21.5377H89.6166C89.9686 21.5377 90.254 21.2483 90.254 20.8918V10.7686H90.2555C90.2555 9.14535 90.8532 7.52065 92.0571 6.26477C94.2062 4.02355 97.3785 3.85528 99.5662 5.03537C99.573 5.03936 99.5801 5.04262 99.5869 5.04624C99.5919 5.04878 99.5969 5.05132 99.6019 5.05386H99.6027C99.6856 5.09375 99.7779 5.11696 99.8756 5.11696C100.124 5.11696 100.339 4.9719 100.444 4.7612L101.905 2.19685C101.913 2.18235 101.92 2.16856 101.928 2.15406Z" fill="#4338CA"/>
</svg>`;
var TOGGLE_ICON_SVG = `<svg width="16" height="16" viewBox="1.05 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<path d="M9.05365 0C5.71033 0 3 2.75516 3 6.15377V15.6309C3 15.8346 3.16248 16 3.36328 16H5.05838C5.25898 16 5.42166 15.8346 5.42166 15.6309V11.0772C6.43342 11.8498 7.69104 12.3077 9.05385 12.3077C12.397 12.3077 15.1077 9.55259 15.1077 6.15397C15.1075 2.75516 12.397 0 9.05365 0ZM9.05365 9.84623C7.04766 9.84623 5.42146 8.19314 5.42146 6.15377C5.42146 4.1146 7.04766 2.46151 9.05365 2.46151C11.0596 2.46151 12.686 4.1146 12.686 6.15377C12.686 8.19293 11.0596 9.84623 9.05365 9.84623Z" fill="currentColor"/>
</svg>`;
var ROTATE_ICON_SVG = `<svg width="15" height="14" viewBox="0 0 15 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<path d="M3.37109 5.80078C3.20703 6.26562 2.6875 6.51172 2.25 6.34766C1.78516 6.18359 1.53906 5.69141 1.70312 5.22656C2.00391 4.37891 2.49609 3.58594 3.15234 2.92969C5.55859 0.550781 9.41406 0.550781 11.8203 2.92969L12.2852 3.42188V2C12.2852 1.53516 12.6953 1.125 13.1602 1.125C13.6523 1.125 14.0352 1.53516 14.0352 2V5.5C14.0352 5.99219 13.6523 6.375 13.1602 6.375H9.6875C9.19531 6.375 8.8125 5.99219 8.8125 5.5C8.8125 5.03516 9.19531 4.625 9.6875 4.625H11.0547L10.5898 4.16016C8.86719 2.46484 6.10547 2.46484 4.38281 4.16016C3.91797 4.65234 3.5625 5.19922 3.37109 5.80078ZM1.56641 8.17969C1.59375 8.15234 1.64844 8.15234 1.67578 8.15234C1.73047 8.15234 1.75781 8.125 1.8125 8.125H5.3125C5.77734 8.125 6.1875 8.53516 6.1875 9C6.1875 9.49219 5.77734 9.875 5.3125 9.875H3.91797L4.38281 10.3672C6.10547 12.0625 8.86719 12.0625 10.5898 10.3672C11.0547 9.875 11.4102 9.32812 11.6016 8.72656C11.7656 8.26172 12.2852 8.01562 12.7227 8.17969C13.1875 8.34375 13.4336 8.83594 13.2695 9.30078C12.9688 10.1484 12.4766 10.9141 11.8203 11.5977C9.41406 13.9766 5.55859 13.9766 3.15234 11.5977L2.6875 11.1055V12.5C2.6875 12.9922 2.27734 13.375 1.8125 13.375C1.32031 13.375 0.9375 12.9922 0.9375 12.5V9.02734C0.9375 8.97266 0.9375 8.91797 0.9375 8.89062C0.9375 8.83594 0.9375 8.80859 0.964844 8.78125C0.992188 8.64453 1.07422 8.50781 1.18359 8.39844C1.29297 8.28906 1.42969 8.20703 1.56641 8.17969Z" fill="currentColor"/>
</svg>`;
var SORT_DOWN_ICON_SVG = `<svg width="9" height="6" viewBox="0 0 9 6" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<path d="M5.24274 5.36865C4.91462 5.72412 4.3404 5.72412 4.01227 5.36865L0.512273 1.86865C0.266179 1.62256 0.184148 1.23975 0.320867 0.911621C0.457586 0.583496 0.785711 0.364746 1.14118 0.364746H8.14118C8.46931 0.364746 8.79743 0.583496 8.93415 0.911621C9.07087 1.23975 8.98884 1.62256 8.74274 1.86865L5.24274 5.36865Z" fill="currentColor"/>
</svg>`;
var XMARK_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<path d="M4.22 4.22a.75.75 0 0 1 1.06 0L8 6.94l2.72-2.72a.75.75 0 1 1 1.06 1.06L9.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L8 9.06l-2.72 2.72a.75.75 0 1 1-1.06-1.06L6.94 8 4.22 5.28a.75.75 0 0 1 0-1.06z" fill="currentColor"/>
</svg>`;
var CLOSE_ICON_SVG = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<path d="M8.17578 1.07031C8.41016 0.816406 8.82031 0.816406 9.05469 1.07031C9.30859 1.30469 9.30859 1.71484 9.05469 1.94922L5.75391 5.25L9.05469 8.57031C9.30859 8.80469 9.30859 9.21484 9.05469 9.44922C8.82031 9.70312 8.41016 9.70312 8.17578 9.44922L4.875 6.14844L1.55469 9.44922C1.32031 9.70312 0.910156 9.70312 0.675781 9.44922C0.421875 9.21484 0.421875 8.80469 0.675781 8.57031L3.97656 5.25L0.675781 1.94922C0.421875 1.71484 0.421875 1.30469 0.675781 1.07031C0.910156 0.816406 1.32031 0.816406 1.55469 1.07031L4.875 4.37109L8.17578 1.07031Z" fill="currentColor"/>
</svg>`;
var TOOLBAR_CSS = ":host{--prepr-primary:#4338ca;--prepr-bg:#eef2ff;--prepr-text:#1f2937;--prepr-radius:8px;--prepr-shadow:0px 0px 40px 0px #1f29373d;--prepr-z-index:10000;--prepr-primary-50:#eef2ff;--prepr-primary-100:#e0e7ff;--prepr-primary-800:#3730a3;--prepr-indigo-600:#4f46e5;--prepr-indigo-50:#eef2ff;--prepr-indigo-700:#4338ca;--prepr-secondary-400:#fb923c;--prepr-secondary-500:#f97316;--prepr-gray-100:#f3f4f6;--prepr-gray-200:#e5e7eb;--prepr-gray-300:#d1d5db;--prepr-gray-400:#9ca3af;--prepr-gray-500:#6b7280;--prepr-gray-700:#374151;--prepr-gray-800:#1f2937;--prepr-gray-900:#111827;--prepr-shadow-sm:0px 0px 12px 0px #c3c3c3cc;color:var(--prepr-text);box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5}:host *,:host :before,:host :after,*,:before,:after{box-sizing:border-box}button{font-family:inherit;font-size:inherit;margin:0}.prepr-regular-text{font-size:.875rem;font-weight:500;line-height:1.5}.prepr-backdrop{z-index:calc(var(--prepr-z-index) - 1);opacity:0;pointer-events:none;background:#0000001a;transition:opacity .2s ease-in-out;position:fixed;top:0;bottom:0;left:0;right:0}.prepr-backdrop[data-open=true]{opacity:1;pointer-events:auto;animation:.2s ease-in-out prepr-fade-in}.prepr-container{z-index:var(--prepr-z-index);justify-content:flex-end;align-items:center;display:flex;position:fixed;top:calc(50% - 64px);right:0}.prepr-toggle-holder{padding:.5rem}.prepr-toggle{cursor:pointer;background:var(--prepr-primary);color:#fff;border:none;border-radius:9999px;justify-content:center;align-items:center;width:2.25rem;height:2.25rem;display:flex}.prepr-toggle svg{color:#fff}.prepr-panel{z-index:var(--prepr-z-index);opacity:0;pointer-events:none;justify-content:flex-end;padding:.75rem;transition:opacity .2s ease-in-out;display:flex;position:fixed;top:50%;right:0;transform:translateY(-50%)}.prepr-panel[data-open=true]{opacity:1;pointer-events:auto;animation:.2s ease-in-out prepr-fade-in}.prepr-content{box-shadow:var(--prepr-shadow);border-radius:var(--prepr-radius);background:var(--prepr-bg);flex-direction:column;gap:2.5rem;width:100%;padding:1.5rem;display:flex}@media (min-width:640px){.prepr-panel{margin-right:4rem;padding:0}.prepr-content{width:502px;padding:2.5rem}}.prepr-header{justify-content:space-between;align-items:center;gap:.5rem;display:flex}.prepr-header-left{align-items:flex-start;gap:.75rem;display:flex}.prepr-badge{background:var(--prepr-primary-100);height:1.5rem;color:var(--prepr-primary);border-radius:4px;align-items:center;padding:.25rem .75rem;font-size:.875rem;display:flex}.prepr-header-close{cursor:pointer;background:var(--prepr-primary-100);width:2rem;height:2rem;color:var(--prepr-gray-700);border:none;border-radius:6px;justify-content:center;align-items:center;display:flex}.prepr-section{flex-direction:column;gap:.5rem;display:flex}.prepr-section-label{color:var(--prepr-gray-400);font-size:.875rem}.prepr-row{flex-wrap:wrap;justify-content:space-between;align-items:center;gap:.5rem 1.5rem;display:flex}.prepr-row-title{color:var(--prepr-gray-800);margin:0;font-size:1rem;font-weight:600}.prepr-radiogroup{border-radius:var(--prepr-radius);border:1px solid var(--prepr-gray-300);background:#fff;align-items:center;gap:.25rem;height:2.5rem;padding:.25rem;display:flex}.prepr-radiogroup[data-disabled=true]{cursor:not-allowed;opacity:.5}.prepr-radiogroup[data-disabled=true] .prepr-radio{pointer-events:none}.prepr-radio{cursor:pointer;white-space:nowrap;text-align:center;height:2rem;color:var(--prepr-gray-900);background:0 0;border:none;border-radius:6px;justify-content:center;align-items:center;padding:.5rem 1.125rem;font-size:.875rem;font-weight:500;transition:all .2s ease-in-out;display:flex}.prepr-radio[data-checked=true]{background:var(--prepr-indigo-600);color:#fff;box-shadow:var(--prepr-shadow-sm)}.prepr-radio[data-checked=true][data-off=true]{background:var(--prepr-gray-800);color:#fff}.prepr-radio-variant{width:82px}.prepr-listbox{position:relative}.prepr-segment-button{border-radius:var(--prepr-radius);border:1px solid var(--prepr-gray-300);width:240px;height:2.5rem;color:var(--prepr-gray-500);cursor:pointer;background:#fff;flex-shrink:0;align-items:center;gap:.5rem;padding:0 .5rem;font-size:.875rem;font-weight:500;display:flex;overflow:hidden}@media (min-width:768px){.prepr-segment-button{padding:0 1rem}}.prepr-segment-button:disabled{cursor:not-allowed;background:var(--prepr-gray-200);color:var(--prepr-gray-400)}.prepr-segment-button[aria-expanded=true]{border-bottom-color:#fff;border-bottom-right-radius:0;border-bottom-left-radius:0}.prepr-segment-label{white-space:nowrap;text-overflow:ellipsis;text-align:left;width:100%;margin-right:auto;overflow:hidden}.prepr-segment-caret{color:var(--prepr-gray-800);display:flex}.prepr-options{z-index:calc(var(--prepr-z-index) + 1);border-left:1px solid var(--prepr-gray-300);border-right:1px solid var(--prepr-gray-300);border-bottom:1px solid var(--prepr-gray-300);-ms-overflow-style:none;scrollbar-width:none;background:#fff;border-radius:0 0 6px 6px;width:240px;max-height:300px;margin:0;padding:0;list-style:none;position:absolute;top:100%;left:0;overflow-y:auto;box-shadow:0 20px 25px -5px #0000001a,0 8px 10px -6px #0000001a}.prepr-options::-webkit-scrollbar{display:none}.prepr-options[hidden]{display:none}.prepr-option-search{background:#fff;padding:.5rem;position:-webkit-sticky;position:sticky;top:0}.prepr-segment-search{border:1px solid var(--prepr-gray-300);border-radius:var(--prepr-radius);width:100%;height:2rem;font:inherit;color:var(--prepr-gray-900);box-sizing:border-box;background:#fff;padding:0 .5rem;font-size:.875rem}.prepr-segment-search::placeholder{color:var(--prepr-gray-400)}.prepr-segment-search:focus{border-color:var(--prepr-gray-400);outline:none}.prepr-option{cursor:pointer;width:100%;color:var(--prepr-gray-900);background:#fff;align-items:center;padding:.5rem 1rem;font-size:.875rem;font-weight:500;display:flex}.prepr-option:hover{background:var(--prepr-gray-100)}.prepr-option[aria-selected=true]{background:var(--prepr-indigo-50);color:var(--prepr-indigo-700)}.prepr-option-label{white-space:nowrap;text-overflow:ellipsis;text-align:left;width:100%;margin-right:auto;overflow:hidden}.prepr-reset{background:var(--prepr-secondary-400);color:#fff;cursor:pointer;border:none;border-radius:6px;justify-content:center;align-items:center;gap:.5rem;width:100%;height:2.5rem;padding:.5rem .75rem;font-size:.875rem;font-weight:500;display:flex}.prepr-reset:hover:not(:disabled){background:var(--prepr-secondary-500)}.prepr-reset:disabled{background:var(--prepr-gray-400);color:var(--prepr-gray-500);cursor:not-allowed}@media (min-width:768px){.prepr-reset{width:108px}}.prepr-indicators{z-index:var(--prepr-z-index);gap:.75rem;display:flex;position:fixed;bottom:1.5rem;right:1.5rem}.prepr-status-pill{background:var(--prepr-primary);color:#fff;cursor:pointer;border:none;border-radius:9999px;align-items:center;gap:.5rem;padding:.5rem 1rem;font-size:.75rem;font-weight:500;transition:background-color .15s;display:flex;box-shadow:0 10px 15px -3px #0000001a,0 4px 6px -4px #0000001a}.prepr-status-pill:hover{background:var(--prepr-primary-800)}.prepr-status-pill[hidden]{display:none}.prepr-status-viewing{color:#fff9;font-size:10px}.prepr-status-segment{text-overflow:ellipsis;white-space:nowrap;max-width:120px;display:inline-block;overflow:hidden}.prepr-status-variant{text-overflow:ellipsis;white-space:nowrap;background:#fff3;border-radius:4px;max-width:80px;padding:0 .5rem;display:inline-block;overflow:hidden}.prepr-status-x{color:#fff;width:.75rem;height:.75rem}.prepr-close-edit-pill{background:var(--prepr-primary-50);color:var(--prepr-gray-800);cursor:pointer;border:none;border-radius:9999px;align-items:center;gap:.5rem;padding:.5rem 1rem;font-size:.75rem;font-weight:500;transition:background-color .15s;display:flex;box-shadow:0 10px 15px -3px #0000001a,0 4px 6px -4px #0000001a}.prepr-close-edit-pill:hover{background:var(--prepr-primary-100)}.prepr-close-edit-pill[hidden]{display:none}.prepr-close-edit-x{width:1rem;height:1rem;color:var(--prepr-gray-500);transition:color .15s}.prepr-close-edit-pill:hover .prepr-close-edit-x{color:var(--prepr-gray-700)}.prepr-tip{z-index:calc(var(--prepr-z-index) + 2);overflow-wrap:break-word;background:var(--prepr-gray-900);color:#fff;pointer-events:none;border-radius:6px;width:auto;max-width:min(420px,100vw - 16px);padding:.5rem .75rem;font-size:.75rem;font-weight:500;position:fixed;box-shadow:0 20px 25px -5px #0000001a,0 8px 10px -6px #0000001a}.prepr-tip-arrow{border-left:6px solid #0000;border-right:6px solid #0000;border-top:6px solid var(--prepr-gray-900);width:0;height:0;position:absolute;top:100%;transform:translate(-50%)}[hidden]{display:none!important}@keyframes prepr-fade-in{0%{opacity:0}to{opacity:1}}";
var f2 = 0;
function u22(e2, t3, n2, o2, i2, u3) {
  t3 || (t3 = {});
  var a2, c2, p22 = t3;
  if ("ref" in p22) for (c2 in p22 = {}, t3) "ref" == c2 ? a2 = t3[c2] : p22[c2] = t3[c2];
  var l22 = { type: e2, props: p22, key: n2, ref: a2, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: void 0, __v: --f2, __i: -1, __u: 0, __source: i2, __self: u3 };
  if ("function" == typeof e2 && (a2 = e2.defaultProps)) for (c2 in a2) void 0 === p22[c2] && (p22[c2] = a2[c2]);
  return l2.vnode && l2.vnode(l22), l22;
}
function RawSvg({ svg, className }) {
  return /* @__PURE__ */ u22(
    "span",
    {
      className,
      dangerouslySetInnerHTML: { __html: svg }
    }
  );
}
function Header({ t: t3, onClose }) {
  return /* @__PURE__ */ u22("div", { class: "prepr-header", children: [
    /* @__PURE__ */ u22("div", { class: "prepr-header-left", children: [
      /* @__PURE__ */ u22(RawSvg, { svg: LOGO_SVG }),
      /* @__PURE__ */ u22("div", { class: "prepr-badge", "data-prepr": "badge", children: t3("common.toolbar") })
    ] }),
    /* @__PURE__ */ u22(
      "button",
      {
        type: "button",
        class: "prepr-header-close",
        "data-prepr": "close",
        "aria-label": t3("common.toolbar"),
        onClick: onClose,
        children: /* @__PURE__ */ u22(RawSvg, { svg: CLOSE_ICON_SVG })
      }
    )
  ] });
}
function PreviewSelector({
  state,
  t: t3,
  handlers
}) {
  const value = String(state.previewMode);
  const options = [
    {
      v: false,
      label: t3("common.off"),
      off: true,
      tooltipKey: "adaptiveContent.offDescription"
    },
    {
      v: true,
      label: t3("common.on"),
      tooltipKey: "adaptiveContent.onDescription"
    }
  ];
  return /* @__PURE__ */ u22("div", { class: "prepr-radiogroup", role: "radiogroup", "data-prepr": "preview-group", children: options.map((opt) => {
    const checked = value === String(opt.v);
    return /* @__PURE__ */ u22(
      "button",
      {
        type: "button",
        class: "prepr-radio",
        "data-prepr": "preview-mode",
        "data-value": String(opt.v),
        "data-off": opt.off ? "true" : void 0,
        role: "radio",
        "data-checked": String(checked),
        "aria-checked": checked,
        "data-tooltip-key": opt.tooltipKey,
        onClick: () => handlers.onPreviewMode(opt.v),
        onMouseEnter: (e2) => handlers.onPreviewTooltipEnter(e2.currentTarget),
        onMouseLeave: () => handlers.onPreviewTooltipLeave(),
        onFocus: (e2) => handlers.onPreviewTooltipEnter(e2.currentTarget),
        onBlur: () => handlers.onPreviewTooltipLeave(),
        children: opt.label
      }
    );
  }) });
}
function SegmentListbox({
  state,
  t: t3,
  listboxOpen,
  segmentFilter,
  handlers
}) {
  const segments = state.segments;
  const hasSegments = segments.length > 0;
  const filter = segmentFilter.trim().toLowerCase();
  const visibleSegments = filter ? segments.filter((s2) => s2.name.toLowerCase().includes(filter)) : segments;
  let label;
  if (!hasSegments) {
    label = t3("adaptiveContent.none");
  } else if (state.selectedSegment === null) {
    label = t3("adaptiveContent.chooseSegment");
  } else {
    const seg = segments.find((s2) => s2._id === state.selectedSegment);
    label = seg ? seg.name : t3("adaptiveContent.chooseSegment");
  }
  const disabled = !hasSegments || !state.previewMode;
  return /* @__PURE__ */ u22("div", { class: "prepr-listbox", children: [
    /* @__PURE__ */ u22(
      "button",
      {
        type: "button",
        class: "prepr-segment-button",
        "data-prepr": "segment-button",
        "aria-haspopup": "listbox",
        "aria-expanded": listboxOpen,
        disabled,
        onClick: () => handlers.onSegmentButtonClick(),
        onKeyDown: (e2) => handlers.onSegmentButtonKeydown(e2),
        children: [
          /* @__PURE__ */ u22("span", { class: "prepr-segment-label", "data-prepr": "segment-button-label", children: label }),
          /* @__PURE__ */ u22("span", { class: "prepr-segment-caret", children: /* @__PURE__ */ u22(RawSvg, { svg: SORT_DOWN_ICON_SVG }) })
        ]
      }
    ),
    /* @__PURE__ */ u22(
      "ul",
      {
        class: "prepr-options",
        "data-prepr": "options",
        role: "listbox",
        hidden: !listboxOpen,
        onKeyDown: (e2) => handlers.onOptionsKeydown(e2),
        children: [
          /* @__PURE__ */ u22("li", { class: "prepr-option-search", role: "none", children: /* @__PURE__ */ u22(
            "input",
            {
              type: "text",
              class: "prepr-segment-search",
              "data-prepr": "segment-search",
              placeholder: t3("adaptiveContent.searchSegments"),
              value: segmentFilter,
              onInput: (e2) => handlers.onSegmentFilterInput(
                e2.currentTarget.value
              )
            }
          ) }),
          visibleSegments.map((seg) => /* @__PURE__ */ u22(
            SegmentOption,
            {
              seg,
              selected: seg._id === state.selectedSegment,
              onChoose: handlers.onChooseSegment
            },
            seg._id
          ))
        ]
      }
    )
  ] });
}
function SegmentOption({
  seg,
  selected,
  onChoose
}) {
  return /* @__PURE__ */ u22(
    "li",
    {
      class: "prepr-option",
      role: "option",
      "data-value": seg._id,
      tabIndex: -1,
      "aria-selected": selected,
      onClick: () => onChoose(seg._id),
      children: /* @__PURE__ */ u22("span", { class: "prepr-option-label", children: seg.name })
    }
  );
}
function VariantSelector({
  state,
  handlers
}) {
  const variantValue = state.selectedVariant === "B" ? "B" : "A";
  const values = ["A", "B"];
  return /* @__PURE__ */ u22(
    "div",
    {
      class: "prepr-radiogroup",
      role: "radiogroup",
      "data-prepr": "variant-group",
      "data-disabled": String(!state.previewMode),
      children: values.map((v2) => {
        const checked = variantValue === v2;
        return /* @__PURE__ */ u22(
          "button",
          {
            type: "button",
            class: "prepr-radio prepr-radio-variant",
            "data-prepr": "variant",
            "data-value": v2,
            role: "radio",
            "data-checked": String(checked),
            "aria-checked": checked,
            onClick: () => handlers.onVariant(v2),
            children: v2
          }
        );
      })
    }
  );
}
function EditModeSelector({
  state,
  t: t3,
  handlers
}) {
  const value = String(state.editMode);
  const options = [
    { v: false, label: t3("common.off"), off: true },
    { v: true, label: t3("common.on") }
  ];
  return /* @__PURE__ */ u22("div", { class: "prepr-radiogroup", role: "radiogroup", "data-prepr": "edit-group", children: options.map((opt) => {
    const checked = value === String(opt.v);
    return /* @__PURE__ */ u22(
      "button",
      {
        type: "button",
        class: "prepr-radio",
        "data-prepr": "edit-mode",
        "data-value": String(opt.v),
        "data-off": opt.off ? "true" : void 0,
        role: "radio",
        "data-checked": String(checked),
        "aria-checked": checked,
        onClick: () => handlers.onEditMode(opt.v),
        children: opt.label
      }
    );
  }) });
}
function StatusPill({
  state,
  t: t3,
  handlers
}) {
  const defaultSegmentName = state.segments.find((s2) => s2._id === "all_other_users")?.name ?? t3("adaptiveContent.allOtherUsers");
  let segmentLabel;
  if (!state.previewMode) {
    segmentLabel = t3("common.user");
  } else if (state.selectedSegment !== null) {
    const seg = state.segments.find((s2) => s2._id === state.selectedSegment);
    segmentLabel = seg ? seg.name : defaultSegmentName;
  } else {
    segmentLabel = defaultSegmentName;
  }
  return /* @__PURE__ */ u22(
    "button",
    {
      type: "button",
      class: "prepr-status-pill",
      "data-prepr": "status-pill",
      hidden: state.isIframe,
      onClick: () => handlers.onStatusPill(),
      children: [
        /* @__PURE__ */ u22("span", { class: "prepr-status-viewing", "data-prepr": "status-viewing", children: t3("common.viewingAs") }),
        /* @__PURE__ */ u22("span", { class: "prepr-status-segment", "data-prepr": "status-segment", children: segmentLabel }),
        /* @__PURE__ */ u22(
          "span",
          {
            class: "prepr-status-variant",
            "data-prepr": "status-variant",
            hidden: !state.previewMode,
            children: state.selectedVariant === "B" ? "B" : "A"
          }
        ),
        /* @__PURE__ */ u22(
          "span",
          {
            class: "prepr-status-x",
            "data-prepr": "status-x",
            hidden: !state.previewMode || state.selectedSegment === null,
            children: /* @__PURE__ */ u22(RawSvg, { svg: XMARK_ICON_SVG })
          }
        )
      ]
    }
  );
}
function CloseEditPill({
  state,
  t: t3,
  handlers
}) {
  return /* @__PURE__ */ u22(
    "button",
    {
      type: "button",
      class: "prepr-close-edit-pill",
      "data-prepr": "close-edit-pill",
      "aria-label": t3("editingTools.ariaCloseEditMode"),
      hidden: !state.editMode || state.isIframe,
      onClick: () => handlers.onCloseEditPill(),
      children: [
        /* @__PURE__ */ u22("span", { "data-prepr": "close-edit-label", children: t3("editingTools.editMode") }),
        /* @__PURE__ */ u22("span", { class: "prepr-close-edit-x", children: /* @__PURE__ */ u22(RawSvg, { svg: XMARK_ICON_SVG }) })
      ]
    }
  );
}
function Panel({
  state,
  t: t3,
  listboxOpen,
  segmentFilter,
  handlers
}) {
  const hasPersonalization = state.selectedSegment !== null || state.selectedVariant !== null;
  return /* @__PURE__ */ u22(S, { children: [
    /* @__PURE__ */ u22(
      "style",
      {
        dangerouslySetInnerHTML: { __html: TOOLBAR_CSS }
      }
    ),
    /* @__PURE__ */ u22(
      "div",
      {
        class: "prepr-backdrop",
        "data-prepr": "backdrop",
        "data-open": String(state.toolbarOpen)
      }
    ),
    /* @__PURE__ */ u22("div", { class: "prepr-container", children: /* @__PURE__ */ u22("div", { class: "prepr-toggle-holder", children: /* @__PURE__ */ u22(
      "button",
      {
        type: "button",
        class: "prepr-toggle",
        "data-prepr": "toggle",
        "aria-label": t3("common.toolbar"),
        onClick: () => handlers.onToggle(),
        children: /* @__PURE__ */ u22(RawSvg, { svg: TOGGLE_ICON_SVG })
      }
    ) }) }),
    /* @__PURE__ */ u22(
      "div",
      {
        class: "prepr-panel",
        "data-prepr": "panel",
        "data-open": String(state.toolbarOpen),
        children: /* @__PURE__ */ u22(
          "div",
          {
            class: "prepr-content",
            "data-prepr": "content",
            role: "dialog",
            "aria-label": t3("common.toolbar"),
            children: [
              /* @__PURE__ */ u22(Header, { t: t3, onClose: handlers.onClose }),
              /* @__PURE__ */ u22("div", { class: "prepr-section", "data-prepr": "section-adaptive", children: [
                /* @__PURE__ */ u22("span", { class: "prepr-section-label", "data-prepr": "adaptive-label", children: t3("adaptiveContent.adaptiveContent") }),
                /* @__PURE__ */ u22("div", { class: "prepr-row", children: [
                  /* @__PURE__ */ u22("h2", { class: "prepr-row-title", "data-prepr": "preview-label", children: t3("adaptiveContent.enablePreview") }),
                  /* @__PURE__ */ u22(PreviewSelector, { state, t: t3, handlers })
                ] }),
                /* @__PURE__ */ u22("div", { class: "prepr-row", children: [
                  /* @__PURE__ */ u22("h2", { class: "prepr-row-title", "data-prepr": "segment-label", children: t3("adaptiveContent.segment") }),
                  /* @__PURE__ */ u22(
                    SegmentListbox,
                    {
                      state,
                      t: t3,
                      listboxOpen,
                      segmentFilter,
                      handlers
                    }
                  )
                ] }),
                /* @__PURE__ */ u22("div", { class: "prepr-row", children: [
                  /* @__PURE__ */ u22("h2", { class: "prepr-row-title", "data-prepr": "variant-label", children: t3("adaptiveContent.ABVariant") }),
                  /* @__PURE__ */ u22(VariantSelector, { state, handlers })
                ] })
              ] }),
              /* @__PURE__ */ u22("div", { class: "prepr-section", "data-prepr": "section-editing", children: [
                /* @__PURE__ */ u22("span", { class: "prepr-section-label", "data-prepr": "editing-label", children: t3("editingTools.editingTools") }),
                /* @__PURE__ */ u22("div", { class: "prepr-row", children: [
                  /* @__PURE__ */ u22("h2", { class: "prepr-row-title", "data-prepr": "edit-label", children: t3("editingTools.editMode") }),
                  /* @__PURE__ */ u22(EditModeSelector, { state, t: t3, handlers })
                ] })
              ] }),
              /* @__PURE__ */ u22(
                "button",
                {
                  type: "button",
                  class: "prepr-reset",
                  "data-prepr": "reset",
                  disabled: !hasPersonalization,
                  onClick: () => handlers.onReset(),
                  children: [
                    /* @__PURE__ */ u22(RawSvg, { svg: ROTATE_ICON_SVG }),
                    /* @__PURE__ */ u22("span", { "data-prepr": "reset-label", children: t3("common.reset") })
                  ]
                }
              )
            ]
          }
        )
      }
    ),
    /* @__PURE__ */ u22("div", { class: "prepr-indicators", children: [
      /* @__PURE__ */ u22(StatusPill, { state, t: t3, handlers }),
      /* @__PURE__ */ u22(CloseEditPill, { state, t: t3, handlers })
    ] }),
    /* @__PURE__ */ u22("div", { class: "prepr-tip", "data-prepr": "tooltip", role: "tooltip", hidden: true, children: [
      /* @__PURE__ */ u22("span", { "data-prepr": "tooltip-text" }),
      /* @__PURE__ */ u22("span", { class: "prepr-tip-arrow", "data-prepr": "tooltip-arrow" })
    ] })
  ] });
}
var TAG_NAME = "prepr-toolbar";
var HTMLElementBase = typeof HTMLElement === "undefined" ? class {
} : HTMLElement;
var PreprToolbarElement = class extends HTMLElementBase {
  constructor() {
    super(...arguments);
    this.store = null;
    this.t = (key) => key;
    this.unsubscribe = null;
    this.listboxOpen = false;
    this.segmentFilter = "";
    this.handlers = {
      onToggle: () => this.set({ toolbarOpen: !this.state.toolbarOpen }),
      onClose: () => this.set({ toolbarOpen: false }),
      onPreviewMode: (value) => this.set({ previewMode: value }),
      onEditMode: (value) => this.set({ editMode: value }),
      onVariant: (value) => {
        if (!this.state.previewMode) return;
        this.set({ selectedVariant: value });
      },
      // Reset contract: segment to none, variant to 'A' — NOT null, since the
      // resulting `variant_changed` must carry 'A' on the wire — edit mode off.
      onReset: () => this.set({
        selectedSegment: null,
        selectedVariant: "A",
        editMode: false
      }),
      onStatusPill: () => {
        if (!this.state.previewMode) {
          this.set({ previewMode: true });
          return;
        }
        if (this.state.selectedSegment !== null || this.state.selectedVariant !== "A") {
          this.set({ selectedSegment: null, selectedVariant: "A" });
        }
      },
      onCloseEditPill: () => this.set({ editMode: false }),
      onSegmentButtonClick: () => this.toggleListbox(!this.listboxOpen),
      onSegmentButtonKeydown: (e2) => this.onListboxKeydown(e2),
      onOptionsKeydown: (e2) => this.onListboxKeydown(e2),
      onChooseSegment: (id) => this.chooseSegment(id),
      onSegmentFilterInput: (value) => {
        this.segmentFilter = value;
        this.renderPanel(this.state);
      },
      onPreviewTooltipEnter: (el) => this.showTooltip(el),
      onPreviewTooltipLeave: () => this.hideTooltip()
    };
    this.onDocumentMouseDown = (event) => {
      if (!this.listboxOpen) return;
      const button = this.segmentButton();
      const options = this.optionsList();
      if (!button || !options) return;
      const path = event.composedPath();
      if (!path.includes(button) && !path.includes(options)) {
        this.toggleListbox(false);
      }
    };
  }
  /** Idempotent: calling connect twice re-wires to the (possibly new) store. */
  connect(store, t3) {
    this.store = store;
    this.t = t3;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }
    this.unsubscribe?.();
    this.unsubscribe = store.subscribe((state) => this.renderPanel(state));
    document.removeEventListener("mousedown", this.onDocumentMouseDown);
    document.addEventListener("mousedown", this.onDocumentMouseDown);
    this.renderPanel(store.get());
  }
  disconnectedCallback() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    document.removeEventListener("mousedown", this.onDocumentMouseDown);
  }
  // --------------------------------------------------------------- rendering
  get state() {
    return this.store.get();
  }
  set(patch) {
    this.store?.set(patch);
  }
  // Synchronous: Preact's top-level render() mutates the DOM before returning.
  renderPanel(state) {
    const root = this.shadowRoot;
    if (!root) return;
    R(
      k(Panel, {
        state,
        t: this.t,
        listboxOpen: this.listboxOpen,
        segmentFilter: this.segmentFilter,
        handlers: this.handlers
      }),
      root
    );
  }
  // ---------------------------------------------------------------- tooltip
  tip() {
    return this.shadowRoot?.querySelector('[data-prepr="tooltip"]') ?? null;
  }
  /**
   * Show the tooltip for a trigger carrying `data-tooltip-key`. Applied
   * imperatively rather than through the Preact tree: hover/focus never write
   * to the store, so no re-render can clobber it in between. Positioning is
   * centered above the trigger, clamped to the viewport with 8px padding,
   * arrow tracking the trigger center.
   */
  showTooltip(trigger) {
    const tooltip = this.tip();
    if (!tooltip) return;
    const textEl = tooltip.querySelector(
      '[data-prepr="tooltip-text"]'
    );
    const arrowEl = tooltip.querySelector(
      '[data-prepr="tooltip-arrow"]'
    );
    const key = trigger.getAttribute("data-tooltip-key");
    if (!key || !textEl || !arrowEl) return;
    textEl.textContent = this.t(key);
    tooltip.hidden = false;
    const padding = 8;
    const tip = tooltip.getBoundingClientRect();
    const tri = trigger.getBoundingClientRect();
    const centerX = tri.left + tri.width / 2;
    const spaceAbove = tri.top - padding;
    const spaceBelow = window.innerHeight - tri.bottom - padding;
    const placeTop = tip.height + padding <= spaceAbove || tip.height + padding > spaceBelow;
    const top = placeTop ? tri.top - tip.height - 8 : tri.bottom + 8;
    let left = centerX - tip.width / 2;
    if (left < padding) left = padding;
    if (left + tip.width > window.innerWidth - padding) {
      left = window.innerWidth - padding - tip.width;
    }
    const arrowX = Math.max(10, Math.min(centerX - left, tip.width - 10));
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    arrowEl.style.left = `${arrowX}px`;
  }
  hideTooltip() {
    const tooltip = this.tip();
    if (tooltip) tooltip.hidden = true;
  }
  // ------------------------------------------------------- listbox controller
  segmentButton() {
    return this.shadowRoot?.querySelector(
      '[data-prepr="segment-button"]'
    ) ?? null;
  }
  optionsList() {
    return this.shadowRoot?.querySelector(
      '[data-prepr="options"]'
    ) ?? null;
  }
  onListboxKeydown(event) {
    const e2 = event;
    const options = this.optionEls();
    const inSearch = e2.target?.getAttribute?.("data-prepr") === "segment-search";
    if (inSearch && e2.key === " ") return;
    if (options.length === 0 && e2.key !== "Escape") return;
    switch (e2.key) {
      case "Enter":
      case " ": {
        e2.preventDefault();
        if (!this.listboxOpen) {
          this.toggleListbox(true);
        } else {
          const active = this.activeOptionIndex();
          if (active >= 0) this.chooseSegment(options[active].dataset.value);
        }
        break;
      }
      case "Escape": {
        e2.preventDefault();
        this.toggleListbox(false);
        this.segmentButton()?.focus();
        break;
      }
      case "ArrowDown": {
        e2.preventDefault();
        if (!this.listboxOpen) this.toggleListbox(true);
        this.moveActiveOption(1);
        break;
      }
      case "ArrowUp": {
        e2.preventDefault();
        if (!this.listboxOpen) this.toggleListbox(true);
        this.moveActiveOption(-1);
        break;
      }
      default:
        break;
    }
  }
  optionEls() {
    const options = this.optionsList();
    if (!options) return [];
    return Array.from(options.querySelectorAll('[role="option"]'));
  }
  activeOptionIndex() {
    return this.optionEls().findIndex(
      (el) => el.getAttribute("data-active") === "true"
    );
  }
  moveActiveOption(delta) {
    const options = this.optionEls();
    if (options.length === 0) return;
    let index = this.activeOptionIndex();
    index = index < 0 ? 0 : (index + delta + options.length) % options.length;
    options.forEach(
      (el, i2) => el.setAttribute("data-active", String(i2 === index))
    );
    options[index].focus();
  }
  // Open state is view-only, so it lives on the element rather than the store.
  // Active-option attributes and focus are set after the synchronous re-render.
  toggleListbox(open) {
    const button = this.segmentButton();
    if (button?.disabled) return;
    this.listboxOpen = open;
    this.segmentFilter = "";
    this.renderPanel(this.state);
    if (open) {
      const options = this.optionEls();
      const selectedIndex = options.findIndex(
        (el) => el.getAttribute("aria-selected") === "true"
      );
      const activeIndex = selectedIndex >= 0 ? selectedIndex : 0;
      options.forEach(
        (el, i2) => el.setAttribute("data-active", String(i2 === activeIndex))
      );
      this.searchInput()?.focus();
    }
  }
  searchInput() {
    return this.shadowRoot?.querySelector(
      '[data-prepr="segment-search"]'
    ) ?? null;
  }
  chooseSegment(id) {
    this.listboxOpen = false;
    this.segmentFilter = "";
    this.set({ selectedSegment: id });
    this.renderPanel(this.state);
    this.segmentButton()?.focus();
  }
};
function definePreprToolbar() {
  if (typeof customElements === "undefined") return;
  if (!customElements.get(TAG_NAME)) {
    customElements.define(TAG_NAME, PreprToolbarElement);
  }
}
var COOKIE_PREVIEW_MODE = "Prepr-Preview-Mode";
var COOKIE_TOOLBAR_OPEN = "Prepr-Toolbar-Open";
var COOKIE_SEGMENT = "Prepr-Segments";
var COOKIE_VARIANT = "Prepr-ABtesting";
var PARAM_SEGMENT = "prepr_preview_segment";
var PARAM_VARIANT = "prepr_preview_ab";
var PARAM_HIDE_BAR = "prepr_hide_bar";
var ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
function getCookie(name) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((row) => row.startsWith(`${name}=`));
  if (!match) return null;
  const value = match.slice(name.length + 1);
  return decodeURIComponent(value);
}
function setCookie(name, value, options = {}) {
  if (typeof document === "undefined") return;
  const { maxAge, path = "/", sameSite, secure } = options;
  let cookie = `${name}=${encodeURIComponent(value)};path=${path}`;
  if (typeof maxAge === "number") {
    cookie += `;max-age=${maxAge}`;
  }
  if (sameSite) {
    cookie += `;samesite=${sameSite}`;
  }
  if (secure) {
    cookie += ";secure";
  }
  document.cookie = cookie;
}
function removeCookie(name, path = "/", options = {}) {
  if (typeof document === "undefined") return;
  const { sameSite, secure } = options;
  let cookie = `${name}=;path=${path};expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  if (sameSite) {
    cookie += `;samesite=${sameSite}`;
  }
  if (secure) {
    cookie += ";secure";
  }
  document.cookie = cookie;
}
function crossSiteCookieOptions() {
  if (typeof window === "undefined" || !window.isSecureContext) return {};
  return { sameSite: "None", secure: true };
}
var en_default = {
  common: {
    viewingAs: "Viewing as:",
    user: "User",
    off: "Off",
    on: "On",
    reset: "Reset",
    toolbar: "Toolbar"
  },
  adaptiveContent: {
    adaptiveContent: "Adaptive content",
    enablePreview: "Preview mode",
    segment: "Segment",
    ABVariant: "A/B variant",
    chooseSegment: "Choose segment",
    searchSegments: "Search segments",
    none: "No segments",
    allOtherUsers: "All other users",
    offDescription: "View the site as a real user (use cookies)",
    onDescription: "Use the toolbar to simulate segments and A/B variants"
  },
  editingTools: {
    editingTools: "Editing tools",
    editMode: "Edit mode",
    ariaCloseEditMode: "Close edit mode"
  }
};
var nl_default = {
  common: {
    viewingAs: "Bekijken als:",
    user: "Gebruiker",
    off: "Uit",
    on: "Aan",
    reset: "Resetten",
    toolbar: "Toolbar"
  },
  adaptiveContent: {
    adaptiveContent: "Adaptieve inhoud",
    enablePreview: "Preview modus",
    segment: "Segment",
    ABVariant: "A/B-variant",
    chooseSegment: "Kies segment",
    searchSegments: "Zoek segmenten",
    none: "Geen segmenten",
    allOtherUsers: "Alle andere gebruikers",
    offDescription: "Bekijk de site als een echte gebruiker (gebruik cookies)",
    onDescription: "Gebruik de werkbalk om segmenten en A/B-varianten te simuleren"
  },
  editingTools: {
    editingTools: "Editing Tools",
    editMode: "Edit mode",
    ariaCloseEditMode: "Edit mode sluiten"
  }
};
var dictionaries = {
  en: en_default,
  nl: nl_default
};
var LOCALES = Object.keys(dictionaries);
function isLocale(value) {
  return typeof value === "string" && value in dictionaries;
}
function getDict(locale) {
  return isLocale(locale) ? dictionaries[locale] : dictionaries.en;
}
function getFromPath(obj, path) {
  return path.split(".").reduce(
    (acc, key) => acc && typeof acc === "object" ? acc[key] : void 0,
    obj
  );
}
function format(message, vars) {
  if (!vars) return message;
  return Object.keys(vars).reduce(
    (acc, k2) => acc.replace(new RegExp(`\\{${k2}\\}`, "g"), String(vars[k2])),
    message
  );
}
function t2(key, locale, vars) {
  const dict = getDict(locale);
  const msg = getFromPath(dict, key);
  if (typeof msg === "string") return format(msg, vars);
  return key;
}
var DEFAULT_ALLOWED_EDITOR_ORIGINS = [
  "https://editor.prepr.io",
  "https://app.prepr.io"
];
function isAllowedEditorOrigin(origin, allowed) {
  return allowed.includes(origin);
}
function createIframeBridge(store, options = {}) {
  const allowedOrigins = options.allowedEditorOrigins ?? DEFAULT_ALLOWED_EDITOR_ORIGINS;
  let parentOrigin = null;
  const onKeyDown = (event) => {
    const key = event.key.toLowerCase();
    const blocked = (event.ctrlKey || event.metaKey) && ["s", "p", "l"].includes(key);
    if (blocked) event.preventDefault();
  };
  const onMessage = (evt) => {
    const data = evt?.data;
    if (data?.event === "prepr:initVE" && !parentOrigin) {
      if (!isAllowedEditorOrigin(evt.origin, allowedOrigins)) return;
      parentOrigin = evt.origin;
      setTrustedParentOrigin(parentOrigin);
      if (data.scrollPosition != null) {
        const top = data.scrollPosition;
        setTimeout(() => window.scrollTo(0, top), 1);
      }
      store.set({ previewMode: true, editMode: data.editMode ?? true });
    }
    if (!parentOrigin || evt.origin !== parentOrigin) return;
    if (data?.event === "prepr:getScrollPosition") {
      const currentScrollY = window.scrollY || document.documentElement.scrollTop;
      sendPreprEvent("getScrollPosition", { value: currentScrollY });
    }
  };
  return {
    start() {
      sendPreprEvent("loaded", void 0, { allowUntrustedTarget: true });
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("message", onMessage);
    },
    stop() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("message", onMessage);
      parentOrigin = null;
      setTrustedParentOrigin(null);
    }
  };
}
function cookieOpts() {
  return {
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
    ...crossSiteCookieOptions()
  };
}
function createChangeHandler(deps) {
  const { store, stega, syncAutoClean } = deps;
  function updateParams(patch) {
    const [path, existing] = splitPath(deps.currentPath());
    const params = new URLSearchParams(existing);
    for (const [name, value] of Object.entries(patch)) {
      if (value === null) {
        params.delete(name);
      } else {
        params.set(name, value);
      }
    }
    const query = params.toString();
    deps.navigate(query ? `${path}?${query}` : path);
  }
  return function handleChange(before, after) {
    const paramPatch = {};
    if (before.selectedSegment !== after.selectedSegment) {
      if (after.selectedSegment === null) {
        removeCookie(COOKIE_SEGMENT, "/", crossSiteCookieOptions());
      } else {
        setCookie(COOKIE_SEGMENT, after.selectedSegment, cookieOpts());
      }
      paramPatch[PARAM_SEGMENT] = after.selectedSegment;
      sendPreprEvent("segment_changed", {
        segment: after.selectedSegment ?? void 0
      });
    }
    if (before.selectedVariant !== after.selectedVariant) {
      if (after.selectedVariant === null) {
        removeCookie(COOKIE_VARIANT, "/", crossSiteCookieOptions());
      } else {
        setCookie(COOKIE_VARIANT, after.selectedVariant, cookieOpts());
      }
      paramPatch[PARAM_VARIANT] = after.selectedVariant;
      sendPreprEvent("variant_changed", {
        variant: after.selectedVariant ?? void 0
      });
    }
    if (Object.keys(paramPatch).length > 0) {
      updateParams(paramPatch);
    }
    if (before.editMode !== after.editMode) {
      if (after.editMode) {
        stega.start();
      } else {
        stega.stop();
      }
      sendPreprEvent("edit_mode_toggled", { editMode: after.editMode });
    }
    if (before.previewMode !== after.previewMode) {
      const coupled = {};
      if (!after.previewMode && after.editMode) {
        coupled.editMode = false;
      }
      if (after.toolbarOpen) {
        coupled.toolbarOpen = false;
      }
      if (Object.keys(coupled).length > 0) {
        store.set(coupled);
      }
      setCookie(COOKIE_PREVIEW_MODE, String(after.previewMode), cookieOpts());
      setCookie(COOKIE_TOOLBAR_OPEN, "false", cookieOpts());
      sendPreprEvent("preview_mode_toggled", { previewMode: after.previewMode });
      syncAutoClean(after.previewMode);
      const [path, existing] = splitPath(deps.currentPath());
      const params = new URLSearchParams(existing);
      if (params.has(PARAM_SEGMENT) || params.has(PARAM_VARIANT)) {
        params.delete(PARAM_SEGMENT);
        params.delete(PARAM_VARIANT);
        const query = params.toString();
        deps.navigate(query ? `${path}?${query}` : path);
      } else {
        deps.reload();
      }
    }
    if (before.toolbarOpen !== after.toolbarOpen) {
      setCookie(COOKIE_TOOLBAR_OPEN, String(after.toolbarOpen), cookieOpts());
    }
  };
}
function splitPath(full) {
  const index = full.indexOf("?");
  if (index === -1) return [full, ""];
  return [full.slice(0, index), full.slice(index + 1)];
}
var debug7 = createScopedLogger("create-toolbar");
var controllerStores = /* @__PURE__ */ new WeakMap();
function defaultNavigation() {
  return {
    navigate: (url) => window.location.assign(url),
    currentPath: () => window.location.pathname + window.location.search
  };
}
function buildSegments(data) {
  return [{ _id: "all_other_users", name: "All other users" }, ...data];
}
function resolveLocale(options) {
  const explicit = options?.locale;
  if (isLocale(explicit)) return explicit;
  if (typeof navigator !== "undefined") {
    const candidates = Array.isArray(navigator.languages) && navigator.languages.length ? navigator.languages : [navigator.language];
    const match = candidates.filter(Boolean).map((l22) => l22.toLowerCase().split("-")[0]).find(isLocale);
    if (match) return match;
  }
  return "en";
}
function createPreprToolbar(opts) {
  const { props, options } = opts;
  const navigation = opts.navigation ?? defaultNavigation();
  initDebugLogger(options?.debug ?? false);
  const noop = () => ({ destroy: () => {
  } });
  if (typeof window === "undefined" || typeof document === "undefined") {
    return noop();
  }
  const isIframe = window.parent !== window;
  const search = new URLSearchParams(window.location.search);
  const hideBar = search.get(PARAM_HIDE_BAR) === "true";
  if (hideBar) {
    debug7.log(`${PARAM_HIDE_BAR}=true \u2014 skipping mount`);
    return noop();
  }
  const locale = resolveLocale(options);
  const previewMode = getCookie(COOKIE_PREVIEW_MODE) === "true";
  const toolbarOpen = getCookie(COOKIE_TOOLBAR_OPEN) === "true";
  const cookieSegment = getCookie(COOKIE_SEGMENT);
  const cookieVariant = getCookie(COOKIE_VARIANT);
  const rawVariant = props.activeVariant ?? cookieVariant;
  const selectedVariant = rawVariant === "A" || rawVariant === "B" ? rawVariant : null;
  const store = createToolbarStore({
    locale,
    segments: buildSegments(props.segments ?? props.data ?? []),
    selectedSegment: props.activeSegment ?? cookieSegment ?? null,
    selectedVariant,
    previewMode,
    toolbarOpen,
    isIframe
  });
  let el = null;
  if (!isIframe) {
    definePreprToolbar();
    el = document.createElement("prepr-toolbar");
    document.body.appendChild(el);
    el.connect(store, (key) => t2(key, locale));
  }
  const stega = createStegaController({
    // The CMS deep-link tooltip is noise inside the editor; clicking the
    // element itself requests the edit there.
    tooltip: !isIframe,
    // In the editor, ask the parent to focus the field instead of opening a new
    // tab. Standalone previews keep the window.open behaviour.
    onEdit: ({ href, origin, id, field }) => {
      if (isIframe) {
        sendPreprEvent("field_edit_requested", { href, origin, id, field });
      } else if (href) {
        window.open(href);
      }
    }
  });
  const autoClean = createStegaAutoClean();
  let autoCleanActive = false;
  function syncAutoClean(active) {
    if (active && !autoCleanActive) {
      autoClean.start();
      autoCleanActive = true;
    } else if (!active && autoCleanActive) {
      autoClean.stop();
      autoCleanActive = false;
    }
  }
  const handleChange = createChangeHandler({
    store,
    navigate: (url) => navigation.navigate(url),
    currentPath: () => navigation.currentPath(),
    reload: navigation.reload ?? (() => window.location.reload()),
    stega,
    syncAutoClean
  });
  let prev = store.get();
  const unsubscribe = store.subscribe((state) => {
    const before = prev;
    prev = state;
    handleChange(before, state);
  });
  syncAutoClean(store.get().previewMode);
  const bridge = createIframeBridge(store);
  sendPreprEvent("getScrollPosition", { value: 0 }, {
    allowUntrustedTarget: true
  });
  if (isIframe) {
    bridge.start();
  }
  function destroy() {
    unsubscribe();
    stega.stop();
    syncAutoClean(false);
    if (isIframe) {
      bridge.stop();
    }
    el?.remove();
    debug7.log("toolbar destroyed");
  }
  const controller = { destroy };
  controllerStores.set(controller, store);
  return controller;
}
var PIXEL_SCRIPT_URL = "https://cdn.tracking.prepr.io/js/prepr-v2.min.js";
var CACHE_BUST_INTERVAL_MS = 24 * 60 * 60 * 1e3;
function loadTrackingPixel(trackingId, config) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  if (window.prepr) {
    return;
  }
  const queueFn = ((...args) => {
    if (queueFn.process) {
      queueFn.process(...args);
    } else {
      queueFn.queue.push(args);
    }
  });
  queueFn.queue = [];
  queueFn.t = Date.now();
  window.prepr = queueFn;
  const script = document.createElement("script");
  script.async = true;
  const cacheBuster = Math.ceil(Date.now() / CACHE_BUST_INTERVAL_MS) * CACHE_BUST_INTERVAL_MS;
  script.src = `${PIXEL_SCRIPT_URL}?t=${cacheBuster}`;
  const firstScript = document.getElementsByTagName("script")[0];
  if (firstScript?.parentNode) {
    firstScript.parentNode.insertBefore(script, firstScript);
  } else {
    document.head.appendChild(script);
  }
  if (config !== void 0) {
    queueFn("init", trackingId, config);
  } else {
    queueFn("init", trackingId);
  }
  queueFn("event", "pageload");
}

// src/client.js
function readJSON(selector) {
  const el = document.querySelector(selector);
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent);
  } catch {
    return null;
  }
}
var pixel = readJSON("script[data-prepr-pixel-props]");
if (pixel?.id) loadTrackingPixel(pixel.id);
var toolbarProps = readJSON("script[data-prepr-toolbar-props]");
if (toolbarProps) createPreprToolbar({ props: toolbarProps });
