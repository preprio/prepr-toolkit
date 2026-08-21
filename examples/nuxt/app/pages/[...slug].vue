<script setup lang="ts">
import { print } from 'graphql';
import { getPreprHeaders } from '@preprio/toolkit/nuxt';
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

const { data } = await useAsyncData(`page-${slug}`, async () => {
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

const page = data.value.Page;

useHead({ meta: [{ property: 'prepr:id', content: page._id }] });
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
