// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

// `output: 'server'` (SSR) is required so the middleware (`onPreprRequest`)
// actually runs per-request — it forwards Prepr request headers downstream
// and sets response cookies. The standalone Node adapter lets `astro build`
// emit a self-contained server we can boot headlessly (`node dist/server/entry.mjs`).
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  vite: {
    plugins: [tailwindcss()],
  },
});
