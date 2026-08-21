import { Suspense } from 'react';

// Helper function to get all the props for the PreprToolbar component (this needs a server component)
import { getToolbarProps, PreprToolbar } from '@preprio/toolkit/nextjs';
import { preprGraphqlUrl } from '@/prepr-env';
import { preprFeatures } from '@/prepr-features';

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The toolkit reads no env vars of its own — you decide what "preview" means.
  // This starter uses NODE_ENV; on Vercel `process.env.VERCEL_ENV !== 'production'`
  // is the usual choice, or use your own flag.
  const isPreview = process.env.NODE_ENV !== 'production';
  let toolbarProps = null;

  // Read the URL outside the try so a missing env var fails loudly instead of
  // being swallowed by the static-generation catch below.
  const graphqlUrl = isPreview ? preprGraphqlUrl() : null;

  // Wrap in try-catch to handle cases where headers() can't be called during static generation
  if (isPreview && graphqlUrl) {
    try {
      toolbarProps = await getToolbarProps(graphqlUrl, preprFeatures);
    } catch (error) {
      // During static generation (e.g., for not-found pages), headers() may not be available
      // Silently fail and render without the toolbar
      console.error('Failed to fetch toolbar props:', error);
      toolbarProps = null;
    }
  }

  return (
    <>
      {isPreview && toolbarProps ? (
        <>
          <Suspense fallback={null}>
            <PreprToolbar
              {...toolbarProps}
              options={{ features: preprFeatures }}
            />
          </Suspense>
          {children}
        </>
      ) : (
        children
      )}
    </>
  );
}
