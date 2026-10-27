<script setup lang="ts">
import { print } from 'graphql';
import { getPreprHeaders } from '@preprio/toolkit/nuxt';
import { useNormalizedQuery } from '@preprio/toolkit/nuxt/live';
import { GetPageBySlugDocument } from '~/gql/graphql';
import type { GetPageBySlugQuery } from '~/gql/graphql';

// Remount per path so the catch-all refetches on client-side navigation.
definePageMeta({ key: (route) => route.fullPath });

const route = useRoute();
const slugParts = route.params.slug;
const slug =
  Array.isArray(slugParts) && slugParts.length > 0 ? slugParts.join('/') : '/';

const config = useRuntimeConfig();
// Forward the Prepr request headers (segments / A-B variant / customer id) so
// the GraphQL response is personalized for this request. Empty on the client —
// the fetch runs on the server during SSR.
const requestHeaders = useRequestHeaders();

const { data, refresh } = await useAsyncData(`page-${slug}`, async () => {
  const response = await $fetch<{ data: GetPageBySlugQuery }>(
    config.public.preprGraphqlUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(getPreprHeaders(
          new Headers(requestHeaders as Record<string, string>),
        ) as Record<string, string>),
      },
      body: { query: print(GetPageBySlugDocument), variables: { slug } },
    },
  );
  return response.data;
});

if (!data.value?.Page) {
  throw createError({ statusCode: 404, statusMessage: 'Not found' });
}

// Inside the Prepr editor, shows the editor's unsaved changes while they type
// and refetches on save. Returns the data unchanged when not in preview — the
// same flag as the middleware.
const live = useNormalizedQuery(GetPageBySlugDocument, data, {
  enabled: import.meta.dev,
  onSave: refresh,
});
const page = computed(() => live.value!.Page!);

useHead({ meta: [{ property: 'prepr:id', content: () => page.value._id }] });
</script>

<template>
  <div>
    <template v-for="(element, index) in page.content" :key="index">
      <HeroSection v-if="element.__typename === 'Hero'" :item="element" />
      <FeatureSection
        v-else-if="element.__typename === 'Feature'"
        :item="element"
      />
    </template>
  </div>
</template>
