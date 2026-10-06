import { createPreprDraftRoute } from '@preprio/toolkit/nextjs';
import { isPreview } from '@/prepr-client';

// Preview visitors pass through here once (see src/proxy.ts): draft mode
// makes Next skip cached entries, so edits show on the next load.
export const GET = createPreprDraftRoute({ preview: isPreview });
