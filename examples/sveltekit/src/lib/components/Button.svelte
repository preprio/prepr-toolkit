<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    buttonStyle = 'primary',
    class: className = '',
    children,
  }: {
    buttonStyle?: 'primary' | 'secondary';
    class?: string;
    children?: Snippet;
  } = $props();

  const base = 'flex rounded-full text-sm px-6 py-2.5 font-medium';
  const variant = $derived(
    buttonStyle === 'primary'
      ? 'bg-primary-600 hover:bg-primary-700 text-white'
      : 'bg-white hover:bg-gray-50 text-secondary-700'
  );
</script>

<button class={`${base} ${variant} ${className}`}>
  {@render children?.()}
</button>
