import type { ImageLoaderProps } from 'next/image';

/**
 * Custom Next.js image loader for Prepr CMS assets. Prepr's stream CDN resizes
 * at the edge, keyed off comma-separated `{option}_{value}` pairs in a path
 * segment:
 *
 *   https://acme.b-cdn.net/w_2400,h_1600/b7ijwafd586-photo.jpg
 *   https://acme.b-cdn.net/w_800,h_600,fx_75,fy_67/b7ijwafd586-photo.jpg
 *
 * The API emits the asset's real dimensions, so the URL renders as-is; this
 * loader rewrites them to the width `next/image` asks for. Height is scaled
 * alongside width, holding the emitted ratio — which for a cropped asset is the
 * authored crop box, so the crop survives the resize.
 *
 * `fx`/`fy` are focal-point percentages, so they hold at any size and ride
 * through untouched. Quality is not a supported CDN option.
 *
 * Dimensions must be emitted as `w_{n}` first, `h_{n}` immediately after: the
 * pair is rewritten as a unit, and a height that doesn't follow its width is
 * left at the emitted value, distorting the image at the requested width.
 *
 * Consumers can't point `loaderFile` at this package directly — Next joins the
 * path against the app root and `existsSync`-checks it, so a bare specifier
 * fails. They need a one-line wrapper file in the app root:
 *
 *   export { default } from '@preprio/toolkit/nextjs/image-loader';
 *
 * plus `images: { loader: 'custom', loaderFile: './prepr-image-loader.ts' }`.
 */

/** Matches `w_800` or `w_800,h_600` in a transform segment. */
const DIMENSIONS = /\bw_(\d+)(?:,h_(\d+))?/;

/**
 * Rewrites Prepr stream URLs to the width `next/image` asks for. URLs with no
 * `w_` option (other hosts, relative paths) come back unchanged — set
 * `unoptimized` on those `<Image>`s.
 *
 * No upper clamp: the emitted width is the asset's own size or its crop box,
 * neither of which is a ceiling on what the CDN can serve, so capping there
 * would rule out retina.
 */
export default function preprImageLoader({ src, width }: ImageLoaderProps): string {
  return src.replace(DIMENSIONS, (_match, emittedWidth: string, emittedHeight?: string) => {
    if (!emittedHeight) return `w_${width}`;
    const height = Math.round((width * Number(emittedHeight)) / Number(emittedWidth));
    return `w_${width},h_${height}`;
  });
}
