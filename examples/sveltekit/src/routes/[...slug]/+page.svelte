<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { normalizedQuery } from '@preprio/toolkit/sveltekit/live';
  import Hero from '$lib/sections/Hero.svelte';
  import Feature from '$lib/sections/Feature.svelte';
  import { GetPageBySlugDocument } from '../../gql/graphql';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // Inside the Prepr editor, shows the unsaved changes while the editor
  // types; on save, `invalidateAll` reruns `load` for the stored content.
  // Outside it, `$result` is the loaded data as-is.
  const result = $derived(
    normalizedQuery(
      GetPageBySlugDocument,
      { Page: data.page },
      { enabled: data.preview, onSave: invalidateAll },
    ),
  );
  const page = $derived($result.Page);
</script>

<svelte:head>
  <meta property="prepr:id" content={page._id} />
</svelte:head>

{#each page.content ?? [] as element}
  {#if element.__typename === 'Hero'}
    <Hero item={element} />
  {:else if element.__typename === 'Feature'}
    <Feature item={element} />
  {/if}
{/each}
