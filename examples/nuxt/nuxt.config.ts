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
      // Public demo token; override with NUXT_PUBLIC_PREPR_GRAPHQL_URL.
      preprGraphqlUrl:
        'https://graphql.prepr.io/ac_5e48636ec968b4fe9b7490b0fc4f7702e51873418ae2acbc58c6431d9fe27429',
    },
  },
});
