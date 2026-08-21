<script setup lang="ts">
const navItems = [
  { text: 'Find a car', href: '/catalog' },
  { text: 'About Acme', href: '#' },
  { text: 'Blog', href: '#' },
  { text: 'Contacts', href: '#' },
];
</script>

<template>
  <header class="bg-primary-100 py-4">
    <nav aria-label="Global">
      <div
        class="mx-auto max-w-8xl p-spacing flex items-center justify-between"
      >
        <a href="/">
          <span class="flex md:hidden"><Logo :text="false" /></span>
          <span class="hidden md:flex"><Logo /></span>
        </a>
        <ul class="flex flex-wrap items-center justify-center gap-8 lg:gap-12">
          <li v-for="item in navItems" :key="item.text">
            <NuxtLink :to="item.href">{{ item.text }}</NuxtLink>
          </li>
          <li>
            <a href="#"><Button button-style="secondary">CALCULATOR</Button></a>
          </li>
        </ul>
      </div>
    </nav>
  </header>
</template>
