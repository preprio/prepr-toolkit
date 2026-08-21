import { print } from 'graphql';
import { error } from '@sveltejs/kit';
import { Prepr } from '$lib/prepr.server';
import { GetPageBySlugDocument } from '../../gql/graphql';
import type { GetPageBySlugQuery } from '../../gql/graphql';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, request }) => {
  const slug = params.slug || '/';

  // DEBUG
  const _debug = {
    segments: request.headers.get('Prepr-Segments'),
    ab: request.headers.get('Prepr-ABtesting'),
    url: request.url,
  };

  // GetPageBySlugDocument is a TypedDocumentNode; print() it to the raw query
  // string the fetch helper needs.
  const response = await Prepr(
    print(GetPageBySlugDocument),
    { slug },
    request.headers,
  );
  const { data } = (await response.json()) as { data: GetPageBySlugQuery };

  if (!data?.Page) {
    throw error(404, 'Not found');
  }

  return { page: data.Page, _debug };
};
