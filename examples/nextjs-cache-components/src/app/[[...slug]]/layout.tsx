import { Suspense } from 'react';
import { getToolbarProps, PreprToolbar } from '@preprio/toolkit/nextjs';
import { preprGraphqlUrl } from '@/prepr-env';
import { preprFeatures } from '@/prepr-features';
import { isPreview } from '@/prepr-client';

// The toolbar reads request headers (active segment / variant), so with Cache
// Components it renders inside <Suspense> and streams in after the static
// shell instead of making the whole route dynamic.
async function Toolbar() {
  const toolbarProps = await getToolbarProps(preprGraphqlUrl(), preprFeatures);
  return (
    <PreprToolbar {...toolbarProps} options={{ features: preprFeatures }} />
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {isPreview && (
        <Suspense fallback={null}>
          <Toolbar />
        </Suspense>
      )}
      {children}
    </>
  );
}
