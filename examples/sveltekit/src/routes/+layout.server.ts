import { dev } from '$app/environment';
import { getToolbarProps } from '@preprio/toolkit/sveltekit';
import { graphqlUrl } from '$lib/prepr.server';
import type { LayoutServerLoad } from './$types';

// The toolkit reads no env vars of its own — you decide what "preview" means.
// This starter uses SvelteKit's built-in `dev` flag. Wrapped defensively so a
// fetch failure never breaks page render.
export const load: LayoutServerLoad = async ({ request }) => {
  if (!dev) return { toolbarProps: null };

  try {
    const toolbarProps = await getToolbarProps(request.headers, graphqlUrl());
    return { toolbarProps };
  } catch (error) {
    console.error('Failed to fetch toolbar props:', error);
    return { toolbarProps: null };
  }
};
