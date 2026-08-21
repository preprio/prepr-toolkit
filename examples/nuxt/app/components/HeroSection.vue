<script setup lang="ts">
import type { HeroFragment } from '~/gql/graphql';

defineProps<{ item: HeroFragment }>();
</script>

<!-- data-prepr-variant-key on the section collects impressions for the A/B variant -->
<template>
  <section
    class="bg-primary-50"
    :data-prepr-variant-key="item._context?.variant_key"
  >
    <div
      class="mx-auto max-w-8xl p-spacing flex flex-col items-center md:flex-row gap-8 py-10 lg:py-20"
    >
      <div class="basis-6/12">
        <h1
          class="text-mb-5xl lg:text-7xl text-secondary-700 font-medium break-words text-balance"
        >
          {{ item.heading }}
        </h1>
        <p
          class="text-mb-lg text-secondary-500 lg:text-lg mt-4 lg:mt-6 text-balance"
        >
          {{ item.sub_heading }}
        </p>
        <div class="flex gap-4 mt-8 xl:mt-10">
          <div>
            <!-- data-prepr-variant-event collects click events on the CTA -->
            <a href="#" data-prepr-variant-event
              ><Button>Find your car</Button></a
            >
          </div>
        </div>
      </div>
      <div class="basis-6/12 relative flex justify-end items-center">
        <div
          class="z-10 flex items-center aspect-[20/17] w-9/12 overflow-hidden justify-center absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
        >
          <img
            :src="item.image?.url || ''"
            alt="Hero"
            width="720"
            height="360"
            class="object-cover rounded-2xl"
          />
        </div>
        <div
          class="w-9/12 aspect-[20/17] bg-primary-100 rounded-3xl right-0 top-0 z-0"
        ></div>
      </div>
    </div>
  </section>
</template>
