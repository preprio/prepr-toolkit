# Express + EJS example

A plain-JS marketing site (no meta-framework) showing how to add
[`@preprio/toolkit`](../../packages/toolkit) to an existing **Express** app:
preview toolbar, personalization/variant tracking, and the tracking pixel.

## The integration in one file

Everything toolkit-specific lives in [`src/prepr.js`](./src/prepr.js) — copy that
pattern into your own Express app:

- `preprMiddleware({ preview })` — adapts the Express request to the toolkit's
  runtime-neutral core, persists the Prepr cookies on the response, and exposes the
  forward-headers as `res.locals.preprHeaders`.
- `fetchPage(slug, headers, url)` — a GraphQL fetch that forwards those headers.
- `getToolbarProps(headers, url)` — resolves preview-toolbar props (preview only).

`server.js` stays a plain Express app; `views/` are ordinary EJS templates that
emit the `data-prepr-*` markup the client bootstrap in `src/client.js` reads.

## Run

    cp .env.example .env
    pnpm install
    pnpm --filter example-express dev

Open http://localhost:8787. The preview toolbar is on whenever `NODE_ENV` is not
`production`, so it shows up in dev by default — see `IS_PREVIEW` in
`server.js` to point it at a different signal.
