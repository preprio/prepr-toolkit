<script lang="ts">
  /**
   * Loads Prepr's CDN tracking pixel client-side via `loadTrackingPixel`
   * (core). Renders nothing visible. Ships as SOURCE — see PreprToolbar.svelte.
   */
  import { onMount } from 'svelte';
  import { loadTrackingPixel } from '@preprio/toolkit';
  import type { PreprPixelConfig } from '@preprio/toolkit';

  interface Props {
    id: string;
    config?: PreprPixelConfig;
  }

  let { id, config }: Props = $props();

  onMount(() => {
    loadTrackingPixel(id, config ?? undefined);
  });
</script>
