# Any other framework

[← Back to the README](../README.md)

The core is runtime-neutral: it works off a WHATWG `Request` and hands back the headers to forward to Prepr plus the cookies to persist. Adapting it to Express, Hono, Fastify, or a plain server is roughly twenty lines.

**Server** — translate your framework's request and response to and from those neutral shapes:

```javascript
import { processPreprRequest } from '@preprio/toolkit';

export function preprMiddleware({ preview } = {}) {
  return (req, res, next) => {
    const { requestHeaders, responseCookies } = processPreprRequest(
      toWebRequest(req),
      {
        preview,
      },
    );

    for (const cookie of responseCookies) {
      res.cookie(cookie.name, cookie.value, {
        maxAge: cookie.maxAge * 1000,
        path: cookie.path,
        // Preview cookies carry `SameSite=None; Secure` on HTTPS. Drop these
        // and the browser discards them inside the Prepr editor's iframe.
        ...(cookie.sameSite && { sameSite: cookie.sameSite.toLowerCase() }),
        ...(cookie.secure && { secure: true }),
      });
    }

    res.locals.preprHeaders = requestHeaders;
    next();
  };
}
```

Forward the headers on your GraphQL fetch with `getPreprHeadersFromHeaders(requestHeaders)`, and resolve toolbar props with `getToolbarPropsFromHeaders(requestHeaders, graphqlUrl)`.

**Client** — mount the toolbar imperatively:

```javascript
import { createPreprPreview, loadTrackingPixel } from '@preprio/toolkit';

loadTrackingPixel('YOUR_ACCESS_TOKEN');

const controller = createPreprPreview({ props: toolbarProps });
// later: controller.destroy()
```

Serialize the server-computed props into the page — a `<script type="application/json">` tag works well — and read them back on the client. See the runnable example at [`examples/express`](https://github.com/preprio/prepr-toolkit/tree/main/examples/express) for the full source.

## Live preview

Server-rendered stacks can add [live preview](./live-preview.md) with three core exports, the same ones the Astro wrapper is built from:

1. `readLiveLogFromRequest(request)` in the server handler returns the editor's unsaved changes for this request. Call it only in preview, and send `Cache-Control: private, no-store` whenever it returns changes.
2. `normalizeQuery(query, result, { log })` applies them to each GraphQL result before rendering.
3. `startHtmlLivePreview()` in the browser requests the page again while the editor types and updates only the DOM that changed.
