'use client';

import { GetPageBySlugQuery } from '@/gql/graphql';
import HeroSection from '@/components/sections/hero-section';
import FeatureSection from '@/components/sections/feature-section';

type Page = NonNullable<GetPageBySlugQuery['Page']>;

export default function PageContent({ page }: { page: Page }) {
  const elements = page.content.map((element, index) => {
    if (element.__typename === 'Feature') {
      return <FeatureSection key={index} item={element} />;
    } else if (element.__typename === 'Hero') {
      return <HeroSection key={index} item={element} />;
    }
  });

  return <>{elements}</>;
}
