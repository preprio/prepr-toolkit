# Configuration

[← Back to the README](../README.md)

## Middleware options

Every framework's middleware takes the same options object:

```typescript
createPreprMiddleware(request, { preview }); // Next.js
onPreprRequest(context, next, { preview }); // Astro
preprHandle({ preview }); // SvelteKit
handlePreprRequest(event, { preview }); // Nuxt
processPreprRequest(request, { preview }); // core
```

| Option     | Type            | Description                                                                        |
| ---------- | --------------- | ---------------------------------------------------------------------------------- |
| `preview`  | `boolean`       | Enables preview mode. The only gate — resolve it from your own environment signal. |
| `features` | `PreprFeatures` | Disable features app-wide. See [Feature flags](#feature-flags).                    |
| `version`  | `string`        | Override the version reported in the `Prepr-Package` header. Mainly for tests.     |

## Preview options

```typescript
createPreprPreview({ props, options: { debug: true, locale: 'nl' } });
```

The framework components take the same object as their `options` prop.

| Option                 | Type                           | Default       | Description                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `debug`                | `boolean`                      | `false`       | Enable debug logging.                                                                                                                                                                                                                                   |
| `locale`               | `'en' \| 'nl' \| 'fr' \| 'de'` | auto-detected | UI language. Falls back to the first supported browser language, then `en`. Inside the Prepr editor, the editor's interface language wins.                                                                                                              |
| `features`             | `PreprFeatures`                | all enabled   | Which features run. See [Feature flags](#feature-flags).                                                                                                                                                                                                |
| `ui`                   | `boolean`                      | `true`        | Mount the visible toolbar. See [Headless preview](#headless-preview-no-toolbar-ui).                                                                                                                                                                     |
| `allowedEditorOrigins` | `string[]`                     | `*.prepr.io`  | Exact editor origins allowed to drive this preview, for self-hosted or local editors. Replaces the wildcard. `['*']` accepts any origin — development only.                                                                                             |
| `strictMode`           | `boolean`                      | `false`       | Your preview token uses GraphQL strict mode (required fields never null). The editor then holds back new entries until their required fields are filled and never sends a cleared required field as null. Applies to live preview on the same page too. |
| `autoClean`            | `boolean`                      | `true`        | Strip the invisible stega characters from visible text. See [Stega auto-cleaning](./visual-editing.md#stega-auto-cleaning).                                                                                                                             |

`features` and `ui` are independent: `features` decides _what runs_, `ui` decides _whether the toolbar is visible_.

## Feature flags

Preview mode is the master switch. Within it, each feature can be turned off with a `features` object. Everything is **on by default** — omit it and nothing changes.

```typescript
import type { PreprFeatures } from '@preprio/toolkit';

export const preprFeatures: PreprFeatures = {
  segments: false, // or { enabled: false }
  abTesting: true,
  editMode: { enabled: false },
};
```

| Feature     | Off means                                                                                                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `segments`  | No segment picker. No `Prepr-Segments` header, from cookie **or** `?prepr_preview_segment`. No segment cookie written. The `_Segments` API call is skipped, saving a round-trip per page. |
| `abTesting` | No A/B control or variant badge. No `Prepr-ABtesting` header, from cookie **or** `?prepr_preview_ab`. No variant cookie written.                                                          |
| `editMode`  | No Edit mode control, no click-to-edit overlay, no close-edit pill.                                                                                                                       |

Pass the **same object to both sides**. Each enforces its own half, so a feature disabled in only one place is still half-on — the UI would hide a control the middleware still honours:

```typescript
// server
createPreprMiddleware(request, { preview, features: preprFeatures });
const props = await getToolbarProps(graphqlUrl, preprFeatures);

// client
<PreprToolbar {...props} options={{ features: preprFeatures }} />
```

Every framework's `getToolbarProps` takes `features` as its last argument, and every `<PreprToolbar>` accepts an `options` prop. Keeping the object in one module both sides import is the simplest way to stay in sync — the examples use `src/prepr-features.ts` (`shared/prepr-features.ts` in Nuxt).

Disabling a feature also stops its `segment_changed` / `variant_changed` events, and the Reset button ignores it — state the user cannot see is never rewritten.

**`editMode` does not disable the Prepr visual editor.** It governs your site's own click-to-edit affordance. When the Prepr editor frames your site it drives edit mode over its own `postMessage` handshake, which keeps working regardless — that is the CMS operating inside its own iframe, not an affordance offered to your visitors. Treat `editMode: false` as a UI choice, never as a security control.

## Headless preview (no toolbar UI)

`ui: false` keeps every non-visual side effect wired — click-to-edit, the editor bridge, scroll restore, cookies and headers — while rendering no chrome of its own. That is how a site gets live editing, or editor scroll restore, alongside its own UI instead of the Prepr bar.

```typescript
// Live editing, no bar:
const preview = createPreprPreview({
  options: { ui: false, features: { editMode: true } },
});

// Later, on teardown (SPA route change, component unmount):
preview.destroy();
```

`props` is optional here — a headless preview that only wants click-to-edit or scroll restore has no segment list to pass. For scroll restore and nothing else:

```typescript
createPreprPreview({
  options: {
    ui: false,
    features: { segments: false, abTesting: false, editMode: false },
  },
});
```

Scroll restore comes free with any preview, headless or not: inside the live-preview iframe the editor saves and restores the reader's position over the `postMessage` bridge, with no extra call and no configuration.

`?prepr_hide_bar=true` and the editor's own iframe both imply `ui: false`; the bridge stays connected in each case. Outside an iframe the bridge is a no-op, so mounting unconditionally is safe. The handshake is only ever accepted from `https://<tenant>.prepr.io`, or from `allowedEditorOrigins` when set.

## Pixel options

```typescript
loadTrackingPixel(id, {
  destinations: { googleTagManager: true },
  variantImpressionThreshold: 0.5,
});
```

| Option                          | Type      | Description                                                            |
| ------------------------------- | --------- | ---------------------------------------------------------------------- |
| `destinations.googleTagManager` | `boolean` | Forward events to Google Tag Manager.                                  |
| `variantImpressionThreshold`    | `number`  | Visibility ratio required before an A/B variant impression is counted. |

## Theming

The toolbar's shadow DOM reads its look from CSS custom properties set on the `prepr-toolbar` host element, or any ancestor — custom properties inherit through the shadow boundary. All have fallbacks, so theming is entirely optional.

| Custom property   | Purpose                                    | Default                                   |
| ----------------- | ------------------------------------------ | ----------------------------------------- |
| `--prepr-primary` | Toggle button, badges, status pill color   | `#4338ca`                                 |
| `--prepr-bg`      | Panel background                           | `#eef2ff`                                 |
| `--prepr-text`    | Reserved for future text theming           | `#1f2937`                                 |
| `--prepr-radius`  | Corner radius (panel, radio group, inputs) | `8px`                                     |
| `--prepr-shadow`  | Panel drop shadow                          | `0px 0px 40px 0px rgba(31, 41, 55, 0.24)` |
| `--prepr-z-index` | Base stacking order (backdrop/panel/pills) | `10000`                                   |

```css
prepr-toolbar {
  --prepr-primary: #16a34a;
  --prepr-radius: 4px;
}
```

Because the toolbar renders inside a shadow root, none of your own page CSS — Tailwind resets, global styles — can leak in or affect it. These custom properties are the only supported customization surface.

## Internationalization

The toolbar UI ships with English, Dutch, French and German. Pass `locale` explicitly, or omit it to auto-detect from the browser and fall back to `en`. Inside the Prepr editor's preview, the visual editor's labels follow the language the editor user has set for the CMS, falling back to `locale` when the editor sends a language the toolkit does not support:

```typescript
createPreprPreview({ props, options: { locale: 'nl' } });
```
