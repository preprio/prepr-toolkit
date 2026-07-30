<script setup lang="ts">
import { extractAccessToken, getToolbarProps } from '@preprio/toolkit/nuxt';
import PreprToolbar from '@preprio/toolkit/nuxt/components/PreprToolbar';
import PreprTrackingPixel from '@preprio/toolkit/nuxt/components/PreprTrackingPixel';

const config = useRuntimeConfig();
const accessToken = extractAccessToken(config.public.preprGraphqlUrl);

// Toolbar props resolve on the server (they need the request headers set by
// server/middleware/prepr.ts) and reach the client via the Nuxt payload.
// The toolkit reads no env vars of its own — you decide what "preview" means.
// This starter uses Nuxt's dev flag. Wrapped defensively so a fetch failure
// never breaks page render.
const requestHeaders = useRequestHeaders();
const { data: toolbarProps } = await useAsyncData('prepr-toolbar', async () => {
  if (!import.meta.dev) return null;
  try {
    return await getToolbarProps(
      new Headers(requestHeaders as Record<string, string>),
      config.public.preprGraphqlUrl
    );
  } catch (error) {
    console.error('Failed to fetch toolbar props:', error);
    return null;
  }
});
</script>

<template>
  <NavBar />
  <NuxtPage />
  <PreprTrackingPixel v-if="accessToken" :id="accessToken" />
  <PreprToolbar v-if="toolbarProps" v-bind="toolbarProps" />
</template>
