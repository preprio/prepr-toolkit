import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
  compatibilityDate: '2026-07-30',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  vite: {
    // Cast: @tailwindcss/vite types against vite 7, Nuxt bundles vite 8 —
    // structurally compatible at runtime, only the Plugin types disagree.
    plugins: [tailwindcss() as never],
  },
  runtimeConfig: {
    public: {
      // Set NUXT_PUBLIC_PREPR_GRAPHQL_URL in .env — this value reaches the
      // browser, so it must never contain a hardcoded token.
      preprGraphqlUrl: '',
    },
  },
});
