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
  import type {
    PreprNavigationAdapter,
    PreprToolbarComponentProps,
  } from '@preprio/toolkit';

  interface Props extends PreprToolbarComponentProps {
    /**
     * How the toolbar changes the URL when a segment or variant is picked.
     * Defaults to a full page load; pass the app's router for a soft
     * navigation, e.g. `{ navigate: (url) => goto(url, { invalidateAll: true }),
     * currentPath: () => page.url.pathname + page.url.search }`.
     */
    navigation?: PreprNavigationAdapter;
  }

  let {
    activeSegment,
    activeVariant,
    data,
    segments,
    options,
    navigation,
  }: Props = $props();

  onMount(() => {
    const controller = createPreprPreview({
      props: { activeSegment, activeVariant, data, segments },
      options,
      navigation,
    });
    return () => controller.destroy();
  });
</script>
