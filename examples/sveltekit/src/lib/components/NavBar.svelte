<script lang="ts">
  import Logo from './Logo.svelte';
  import Button from './Button.svelte';

  const navItems = [
    { text: 'Find a car', href: '/catalog' },
    { text: 'About Acme', href: '#' },
    { text: 'Blog', href: '#' },
    { text: 'Contacts', href: '#' },
  ];
</script>

<header class="bg-primary-100 py-4">
  <nav aria-label="Global">
    <div class="mx-auto max-w-8xl p-spacing flex items-center justify-between">
      <a href="/">
        <span class="flex md:hidden"><Logo text={false} /></span>
        <span class="hidden md:flex"><Logo /></span>
      </a>
      <ul class="flex flex-wrap items-center justify-center gap-8 lg:gap-12">
        {#each navItems as item}
          <li><a href={item.href}>{item.text}</a></li>
        {/each}
        <li><a href="#"><Button buttonStyle="secondary">CALCULATOR</Button></a></li>
      </ul>
    </div>
  </nav>
</header>
