<script setup lang="ts">
/**
 * Mounts the Prepr toolbar custom element (and stega edit mode); renders
 * nothing itself. `onMounted` keeps it off the SSR path.
 *
 * Ships as source — the consumer's Vite/Vue pipeline compiles this, not our
 * tsup build. See the `./nuxt/components/*` export in package.json.
 */
import { onMounted, onUnmounted } from 'vue';
import { createPreprToolbar } from '@preprio/toolkit';
import type { PreprToolbarComponentProps } from '@preprio/toolkit';

const props = defineProps<{
  activeSegment: PreprToolbarComponentProps['activeSegment'];
  activeVariant: PreprToolbarComponentProps['activeVariant'];
  segments?: PreprToolbarComponentProps['segments'];
  data?: PreprToolbarComponentProps['data'];
  options?: PreprToolbarComponentProps['options'];
}>();

let controller: ReturnType<typeof createPreprToolbar> | null = null;

onMounted(() => {
  controller = createPreprToolbar({
    props: {
      activeSegment: props.activeSegment,
      activeVariant: props.activeVariant,
      segments: props.segments,
      data: props.data,
    },
    options: props.options,
  });
});

onUnmounted(() => controller?.destroy());
</script>

<template>
  <!-- renders nothing; the toolbar is a custom element mounted imperatively -->
</template>
