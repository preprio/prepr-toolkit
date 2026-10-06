import HeroSection from '@/components/sections/hero-section';
import FeatureSection from '@/components/sections/feature-section';
import type { GetPageBySlugQuery } from '@/gql/graphql';

export type PageElement = NonNullable<
  GetPageBySlugQuery['Page']
>['content'][number];

/** Renders page elements in order; element types without a component are skipped. */
export default function Sections({ elements }: { elements: PageElement[] }) {
  return elements.map((element, index) => {
    if (element.__typename === 'Feature') {
      return <FeatureSection key={element._id ?? index} item={element} />;
    }
    if (element.__typename === 'Hero') {
      return <HeroSection key={element._id ?? index} item={element} />;
    }
    return null;
  });
}
