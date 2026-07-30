<script lang="ts">
  /**
   * Loads Prepr's CDN tracking pixel client-side via `loadTrackingPixel`
   * (core). Renders nothing visible. Ships as SOURCE — see PreprToolbar.svelte.
   */
  import { onMount } from 'svelte';
  import { loadTrackingPixel } from '@preprio/toolkit';

  interface Props {
    id: string;
    config?: {
      destinations?: { googleTagManager?: boolean };
      variantImpressionThreshold?: number;
    };
  }

  let { id, config }: Props = $props();

  onMount(() => {
    loadTrackingPixel(id, config ?? undefined);
  });
</script>
