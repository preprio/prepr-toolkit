import { Suspense } from 'react';

// Helper function to get all the props for the PreprToolbar component (this needs a server component)
import { getToolbarProps, PreprToolbar } from '@preprio/toolkit/nextjs';
import { PreprRefresh } from '@preprio/toolkit/nextjs/live';
import { isPreview, preprGraphqlUrl } from '@/prepr-env';
import { preprFeatures } from '@/prepr-features';

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
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
          {/* Live preview: re-renders the route with the editor's unsaved
              changes while they type (see `normalizeQuery` in page.tsx), and
              refreshes it on save. */}
          <PreprRefresh enabled={isPreview} />
          {children}
        </>
      ) : (
        children
      )}
    </>
  );
}
