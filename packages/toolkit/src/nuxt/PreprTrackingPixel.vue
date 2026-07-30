<script setup lang="ts">
/**
 * Loads Prepr's CDN tracking pixel client-side via `loadTrackingPixel`
 * (core). Renders nothing visible. Ships as SOURCE — see PreprToolbar.vue.
 */
import { onMounted } from 'vue';
import { loadTrackingPixel } from '@preprio/toolkit';

const props = defineProps<{
  id: string;
  config?: {
    destinations?: { googleTagManager?: boolean };
    variantImpressionThreshold?: number;
  };
}>();

onMounted(() => {
  loadTrackingPixel(props.id, props.config ?? undefined);
});
</script>

<template>
  <!-- renders nothing; the pixel is injected as a script tag -->
</template>
