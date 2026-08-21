import Link from 'next/link';
import { HeroFragment } from '@/gql/graphql';
import Image from 'next/image';
import Button from '@/components/button';

export default function HeroSection({ item }: { item: HeroFragment }) {
  const image = item.image;

  return (
    /* Set the HTML attribute with the matching data-prepr-variant-key to collect impressions for the whole section */
    <section
      className="bg-primary-50"
      data-prepr-variant-key={item._context?.variant_key}
    >
      <div className="mx-auto max-w-8xl p-spacing flex flex-col items-center md:flex-row gap-8 py-10 lg:py-20">
        <div className="basis-6/12">
          <h1 className="text-mb-5xl lg:text-7xl text-secondary-700 font-medium break-words text-balance">
            {item.heading}
          </h1>
          <p className="text-mb-lg text-secondary-500 lg:text-lg mt-4 lg:mt-6 text-balance">
            {item.sub_heading}
          </p>
          <div className="flex gap-4 mt-8 xl:mt-10">
            <div>
              {/* Set the HTML attribute to collect click events on the link */}
              <Link href="#" data-prepr-variant-event>
                <Button>Find your car</Button>
              </Link>
            </div>
          </div>
        </div>
        <div className="basis-6/12 relative flex justify-end items-center">
          <div className="z-10 flex items-center aspect-[20/17] w-9/12 overflow-hidden justify-center absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <Image
              src={image?.url || ''}
              alt="Hero Image"
              width={720}
              height={360}
              className="object-cover rounded-2xl"
            />
          </div>
          <div className="w-9/12 aspect-[20/17] bg-primary-100 rounded-3xl right-0 top-0 z-0"></div>
        </div>
      </div>
    </section>
  );
}
