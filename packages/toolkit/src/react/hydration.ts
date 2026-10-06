const PROPS_KEY_PREFIX = '__reactProps$';

function reactProps(element: Element): Record<string, unknown> | undefined {
  // Own keys only: React stores its props on the node itself, and a `for...in`
  // would walk hundreds of inherited DOM properties.
  for (const key of Object.keys(element)) {
    if (key.startsWith(PROPS_KEY_PREFIX)) {
      return (element as unknown as Record<string, Record<string, unknown>>)[
        key
      ];
    }
  }
  return undefined;
}

/**
 * Whether React has hydrated the element holding this text. A streamed
 * Suspense boundary is in the DOM well before React adopts it; its elements
 * carry no React props until then. Text inside `dangerouslySetInnerHTML` never
 * gets them, so it counts as hydrated once the element that set the HTML is.
 * Text outside any React-rendered element is not React's and always counts.
 */
export function isReactHydrated(text: Text): boolean {
  for (let el = text.parentElement; el; el = el.parentElement) {
    const props = reactProps(el);
    if (!props) continue;
    return el === text.parentElement || props.dangerouslySetInnerHTML != null;
  }
  return true;
}
