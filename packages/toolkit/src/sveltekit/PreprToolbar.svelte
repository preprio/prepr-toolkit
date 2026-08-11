<script lang="ts">
  /**
   * Mounts the Prepr toolbar custom element (and stega edit mode); renders
   * nothing itself. `onMount` keeps it off the SSR path.
   *
   * Ships as source — the consumer's Vite/Svelte pipeline compiles this, not
   * our tsup build. See the `./sveltekit/components/*` export in package.json.
   */
  import { onMount } from 'svelte';
  import { createPreprPreview } from '@preprio/toolkit';
  import type { PreprToolbarComponentProps } from '@preprio/toolkit';

  let {
    activeSegment,
    activeVariant,
    data,
    segments,
    options,
  }: PreprToolbarComponentProps = $props();

  onMount(() => {
    const controller = createPreprPreview({
      props: { activeSegment, activeVariant, data, segments },
      options,
    });
    return () => controller.destroy();
  });
</script>
