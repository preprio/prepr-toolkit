<script lang="ts">
  import Hero from '$lib/sections/Hero.svelte';
  import Feature from '$lib/sections/Feature.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <meta property="prepr:id" content={data.page._id} />
</svelte:head>

{#each data.page.content ?? [] as element}
  {#if element.__typename === 'Hero'}
    <Hero item={element} />
  {:else if element.__typename === 'Feature'}
    <Feature item={element} />
  {/if}
{/each}
