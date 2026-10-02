import { error } from '@sveltejs/kit';
import { prepr } from '$lib/prepr.server';
import { GetPageBySlugDocument } from '../../gql/graphql';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const slug = event.params.slug || '/';

  // personalize: true forwards the Prepr headers preprHandle computed for this
  // visitor; passing the event also routes the request through event.fetch.
  const { data } = await prepr().query(
    GetPageBySlugDocument,
    { slug },
    { personalize: true, event },
  );

  if (!data.Page) {
    throw error(404, 'Not found');
  }

  return { page: data.Page };
};
