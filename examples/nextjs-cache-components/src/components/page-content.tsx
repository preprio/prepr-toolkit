'use client';

import { useEffect } from 'react';
import { GetPageBySlugQuery } from '@/gql/graphql';
import HeroSection from '@/components/sections/hero-section';
import FeatureSection from '@/components/sections/feature-section';

type Page = NonNullable<GetPageBySlugQuery['Page']>;

export default function PageContent({ page }: { page: Page }) {
  // Hand the page data to a parent editor (e.g. examples/editor-demo) so it
  // can build its field panel.
  useEffect(() => {
    if (window.parent === window) return;
    window.parent.postMessage(
      { name: 'prepr_preview_bar', event: 'page_data', data: page },
      '*',
    );
  }, [page]);

  const elements = page.content.map((element, index) => {
    if (element.__typename === 'Feature') {
      return <FeatureSection key={index} item={element} />;
    } else if (element.__typename === 'Hero') {
      return <HeroSection key={index} item={element} />;
    }
  });

  return <>{elements}</>;
}
