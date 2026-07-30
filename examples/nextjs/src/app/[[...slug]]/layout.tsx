import { Suspense } from 'react'

// Helper function to get all the props for the PreprToolbar component (this needs a server component)
import { getToolbarProps, PreprToolbar } from '@preprio/toolkit/nextjs'

export default async function Layout({ children }: { children: React.ReactNode }) {
    // The toolkit reads no env vars of its own — you decide what "preview" means.
    // This starter uses NODE_ENV; on Vercel `process.env.VERCEL_ENV !== 'production'`
    // is the usual choice, or use your own flag.
    const isPreview = process.env.NODE_ENV !== 'production'
    let toolbarProps = null
    
    // Wrap in try-catch to handle cases where headers() can't be called during static generation
    if (isPreview) {
      try {
        toolbarProps = await getToolbarProps((process.env.PREPR_GRAPHQL_URL || 'https://graphql.prepr.io/ac_5e48636ec968b4fe9b7490b0fc4f7702e51873418ae2acbc58c6431d9fe27429')!)
      } catch (error) {
        // During static generation (e.g., for not-found pages), headers() may not be available
        // Silently fail and render without the toolbar
        console.error('Failed to fetch toolbar props:', error)
        toolbarProps = null
      }
    }

    return (
        <>
            {isPreview && toolbarProps ? (
                <>
                    <Suspense fallback={null}>
                        <PreprToolbar {...toolbarProps} />
                    </Suspense>
                    {children}
                </>
            ) : (
                children
            )}
        </>
    )
}