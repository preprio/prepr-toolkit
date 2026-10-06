'use client';

import { useEffect } from 'react';
import { GetPageBySlugQuery } from '@/gql/graphql';

type Page = NonNullable<GetPageBySlugQuery['Page']>;

/**
 * Hands the page data to a parent editor (e.g. examples/editor-demo) so it
 * can build its field panel. Renders nothing.
 */
export default function EditorBridge({ page }: { page: Page }) {
  useEffect(() => {
    if (window.parent === window) return;
    window.parent.postMessage(
      { name: 'prepr_preview_bar', event: 'page_data', data: page },
      '*',
    );
  }, [page]);

  return null;
}
