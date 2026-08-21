<script setup lang="ts">
import type { FeatureFragment } from '~/gql/graphql';

defineProps<{ item: FeatureFragment }>();
</script>

<template>
  <section
    class="bg-primary-50"
    :data-prepr-variant-key="item._context?.variant_key"
  >
    <div class="mx-auto max-w-8xl p-spacing py-10 lg:py-10 xl:py-20">
      <div
        class="flex flex-col items-start md:items-center md:flex-row gap-8 xl:gap-28 text-secondary-700"
      >
        <div
          v-if="item.image_position === 'LEFT'"
          class="order-first md:order-none basis-1/2"
        >
          <img
            :src="item.image?.url || ''"
            alt="Feature"
            width="800"
            height="300"
            class="rounded-2xl w-full aspect-[29/19] object-cover"
          />
        </div>
        <div class="basis-1/2">
          <h2
            class="text-mb-4xl lg:text-5xl font-medium text-secondary-700 text-balance"
          >
            {{ item.heading }}
          </h2>
          <p class="text-lg mt-4 xl:mt-6 font-medium text-balance">
            {{ item.sub_heading }}
          </p>
          <a href="#"
            ><Button>{{ item.button?.text }}</Button></a
          >
        </div>
        <div
          v-if="item.image_position === 'RIGHT'"
          class="order-first md:order-none basis-1/2"
        >
          <img
            :src="item.image?.url || ''"
            alt="Feature"
            width="800"
            height="300"
            class="rounded-2xl w-full aspect-[29/19] object-cover"
          />
        </div>
      </div>
    </div>
  </section>
</template>
