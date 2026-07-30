import { handlePreprRequest } from '@preprio/toolkit/nuxt';

// `preview` is the only gate — the toolkit reads no env vars of its own. This
// starter uses Nuxt's built-in dev flag; use whatever signal your deployment
// already has. When on, request headers (Prepr-Segments, etc.) are forwarded
// to route handlers / useRequestHeaders and preview cookies are set.
export default defineEventHandler(event => {
  handlePreprRequest(event, { preview: import.meta.dev });
});
