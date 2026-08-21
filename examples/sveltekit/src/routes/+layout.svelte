<script lang="ts">
  import '../app.css';
  import NavBar from '$lib/components/NavBar.svelte';
  import PreprToolbar from '@preprio/toolkit/sveltekit/components/PreprToolbar';
  import PreprTrackingPixel from '@preprio/toolkit/sveltekit/components/PreprTrackingPixel';
  import { extractAccessToken } from '@preprio/toolkit/sveltekit';
  import { preprFeatures, preprGraphqlUrl } from '$lib/prepr';
  import type { Snippet } from 'svelte';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: Snippet } = $props();

  // The pixel is already optional below, so a missing endpoint degrades to
  // "no pixel" rather than throwing and blanking the whole layout.
  const accessToken: string | null = (() => {
    try {
      return extractAccessToken(preprGraphqlUrl());
    } catch {
      return null;
    }
  })();
</script>

<NavBar />
{@render children()}

{#if accessToken}
  <PreprTrackingPixel id={accessToken} />
{/if}
{#if data.toolbarProps}
  <PreprToolbar {...data.toolbarProps} options={{ features: preprFeatures }} />
{/if}
