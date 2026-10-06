import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Partial Prerendering: each route gets a static shell from 'use cache'
  // data, with request-time parts (personalized content, the preview
  // toolbar) streamed into <Suspense> boundaries.
  cacheComponents: true,
  images: {
    remotePatterns: [
      {
        hostname: 'demo-patterns.stream.prepr.io',
      },
    ],
  },
};

export default nextConfig;
