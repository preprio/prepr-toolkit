<script lang="ts">
  import '../app.css';
  import NavBar from '$lib/components/NavBar.svelte';
  import PreprToolbar from '@preprio/toolkit/sveltekit/components/PreprToolbar';
  import PreprTrackingPixel from '@preprio/toolkit/sveltekit/components/PreprTrackingPixel';
  import { extractAccessToken } from '@preprio/toolkit/sveltekit';
  import { PREPR_GRAPHQL_URL, preprFeatures } from '$lib/prepr';
  import type { Snippet } from 'svelte';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: Snippet } = $props();

  const accessToken = extractAccessToken(PREPR_GRAPHQL_URL);
</script>

<NavBar />
{@render children()}

{#if accessToken}
  <PreprTrackingPixel id={accessToken} />
{/if}
{#if data.toolbarProps}
  <PreprToolbar {...data.toolbarProps} options={{ features: preprFeatures }} />
{/if}
