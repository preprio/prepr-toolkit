# Visual editing

[← Back to the README](../README.md)

Click-to-edit works on any text Prepr returns with edit mode enabled on the access token: hover outlines the element, a click opens the field in Prepr. This page covers what happens under the hood and how to mark content the toolkit cannot find by itself.

## How it works

With edit mode enabled, the toolkit scans for stega-encoded content, strips the invisible Unicode characters after load so they cannot cause layout shifts, highlights editable elements by cursor proximity, and talks to the Prepr editor over a `postMessage` bridge when running inside the live-preview iframe.

Stega cleaning is automatic. There is no need to call `vercelStegaSplit` or to strip the payload yourself before rendering — the data attributes the toolkit relies on survive the clean, so edit mode still activates instantly.

## Stega auto-cleaning

Preview content carries its edit payload inside the text itself, as a run of invisible Unicode characters. The toolkit strips them from the DOM after load and keeps stripping them as your framework re-renders.

Leaving them in place is not cosmetic. The characters are real string content: they inflate `String.length`, break text measurement and truncation, and are announced by screen readers.

Turn the stripping off with `autoClean: false`:

```typescript
createPreprPreview({ props, options: { autoClean: false } });
```

Only do this when your app already strips the payload itself — for example by passing every field through `stegaClean` as it renders:

```typescript
import { stegaClean } from '@preprio/toolkit';

<h1>{stegaClean(page.title)}</h1>;
```

Click-to-edit is unaffected by this option. Elements are still tagged from the payload, so the overlay, tooltip and edit bridge keep working either way.

## Choosing the element that becomes editable

The element that gets the outline, the tooltip and the click handler is the **parent of the encoded text node**. Rendering `{title}` inside an `<h2>` makes the `<h2>` editable, which is what you want almost every time.

Two rules govern the choice:

- A parent that renders no box is skipped. An element hidden with `display: none`, `visibility: hidden`, or the `hidden` attribute cannot be hovered or outlined, so tagging it would produce an element that looks editable to the code and is unreachable to the visitor. Nothing is tagged for it.
- `data-prepr-edit-target` overrides the parent. The closest ancestor carrying it becomes the editable element instead.

That attribute is the supported way to separate _where the payload lives_ from _what the visitor clicks_. It is what makes the hidden-payload pattern work:

```html
<!-- The payload rides in a visually hidden span; the <article> is what
     gets outlined and clicked. -->
<article data-prepr-edit-target>
  <h2>Product title</h2>
  <span hidden>{encodedPayload}</span>
</article>
```

Without the attribute that span is skipped entirely — it renders no box, so there is nothing to click.

It is equally useful when the encoded text sits deep inside markup you do not control, and the natural click target is an ancestor:

```html
<figure data-prepr-edit-target>
  <img src="..." alt="..." />
  <figcaption><em>{encodedCaption}</em></figcaption>
</figure>
```

Without it the `<em>` would be the editable element; with it the whole figure is.

## Marking content by hand

Most content needs no markup. These rules cover the rest; they assume your queries select `_id`, see [Preparing your queries](./live-preview.md#preparing-your-queries).

- A `Text` entry's content updates whether the query selects `body`,
  `html` or `text` (the latter with tags stripped).
- **Dynamic content entries are found automatically.** In preview,
  `normalizeQuery`, `normalizedQuery` and `useNormalizedQuery` add each
  entry's `_id` (and, for `Text` entries, the field path) to the hidden edit
  link of every text inside it. Click-to-edit and the editor's "jump to
  field" then find the entry by id, also after an editor reorders entries.
  Render a `Text` entry's HTML straight into one wrapper element, so its
  edit link lands on that wrapper and the whole entry is outlined.
- Prepr images are click-to-edit inside the editor without any markup: the
  toolkit matches image URLs (also through image optimizers like
  `/_next/image`) to the open item's assets.
- **A removed image stays until the editor picks another or saves.** The
  page keeps rendering it, faded to 20% opacity, so the layout does not
  shift while the editor chooses a replacement. It stays click-to-edit and
  opens its field. A newly picked image replaces it; after a save the page
  renders stored content, so an empty state you render for a missing image
  shows only then. In a field with several images, a removed one keeps its
  place when the query selects the assets' `_id`.
- **Set the attributes yourself only where that does not reach:**
  - Data you fetch in the browser without those helpers: run it through
    `annotateEditLinks(result, query)` from `@preprio/toolkit`, or mark the
    element as below.
  - An entry with no text and no Prepr image (an embed, a video URL): wrap
    it in an element with `data-prepr-edit-target="<field>.<index>"` and
    `data-prepr-entry-id="<entry _id>"` (for `Assets`, the first asset's
    `_id`). Attributes you set always win over the automatic ones.
  - Other values without a hidden edit link (video and other URLs): make
    them click-to-edit with
    `previewAttrs({ id, field }, { enabled: preview })` on the element that
    renders them. Encoded text inside that element does not override it.
  - Fields Prepr returns without an edit link, such as remote content, next
    to a text field that has one: `stegaTarget(text, { field })` reads the
    item and path from the text and points at the sibling field, ready for
    `previewAttrs`. Use `products.items.2` to point at one entry.

    ```tsx
    // Each product card opens its row of the component's `products` field.
    <article
      {...previewAttrs(
        stegaTarget(block.title, { field: `products.items.${index}` }),
        { enabled: preview },
      )}
    >
    ```
- Where the page renders a linked item whose content comes from items nested
  inside it (for example a personalization or a shared section referenced
  from a stack), wrap it in an element with
  `data-prepr-reference="<linked item _id>"`. The editor only knows the items
  the open item links to directly; content inside the wrapper is outlined as
  that linked item, and clicking it opens the link in the editor.
- Content of items the open item does not link to (for example news cards
  filled by a query) is outlined muted as "other item". Clicking it does not
  follow its link: the editor offers to open that item, or to go to the
  linked page. Ctrl/Cmd/Shift-click still opens the link in a new tab, and
  Alt-click follows it. Inside the site's header, footer and navigation
  (`header`, `footer`, `nav` and the `banner`, `contentinfo` and
  `navigation` roles) such content stays unmarked and its links behave as
  any other page link (a `header` or `footer` inside an `article`, `section`,
  `aside` or `main` belongs to that content and is not site chrome). Change
  that per part of the page with an attribute on
  an ancestor; the nearest one wins:
  - `data-prepr-other-item="off"` keeps other items inside it unmarked.
  - `data-prepr-other-item="on"` marks them, also inside a header, footer or
    navigation.

## Attribute reference

| Attribute                                                                                         | Set by                     | Meaning                                                                                                                            |
| ------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `data-prepr-edit-target`                                                                          | you                        | Makes this ancestor the editable element instead of the text's parent. With a value (`<field>.<index>`), names the entry it shows. |
| `data-prepr-entry-id`                                                                             | you                        | `_id` of the list entry an element shows.                                                                                          |
| `data-prepr-reference`                                                                            | you                        | `_id` of the linked item whose content this element wraps.                                                                         |
| `data-prepr-other-item`                                                                           | you                        | `on` or `off`: whether content of unrelated items inside is outlined.                                                              |
| `data-prepr-encoded`, `data-prepr-id`, `data-prepr-field`, `data-prepr-locale`, `data-prepr-href` | toolkit, or `previewAttrs` | Mark an editable element and the field it shows. Do not write these by hand; use `previewAttrs`.                                   |
