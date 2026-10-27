# Prepr editor emulator

Static harness that emulates the Prepr CMS editor for live-preview
development: loads a project in an iframe, performs the `prepr:initVE`
handshake, builds an editable field panel from the page's own data
(the Next.js example posts it up as `page_data`), and sends
`prepr:fieldChange` per keystroke / `prepr:itemChanged` on Save.

## Run

1. Trust the emulator's origin in the Next.js example: add
   `allowedEditorOrigins: ['http://localhost:4444']` to the toolbar's
   `options` and `allowedEditorOrigins={['http://localhost:4444']}` to
   `PreprRefresh`. The toolkit only takes editor messages from
   `https://*.prepr.io` by default. Don't commit this.
2. Start the Next.js example on port 3000 (`pnpm dev` in `examples/nextjs`).
3. `pnpm dev` here (serves on http://localhost:4444).
4. Open http://localhost:4444, click **Load**.
5. Type in a field → the preview updates instantly (push leg).
6. Click **Save** → the preview refetches (refetch leg; reflects API state).

Must be served over http (`file://` gives a `null` origin, which breaks
the origin-trust handshake with the toolkit).
