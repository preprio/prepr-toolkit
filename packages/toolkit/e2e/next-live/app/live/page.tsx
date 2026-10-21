import { normalizeQuery } from '@preprio/toolkit/nextjs';

import { PAGE_QUERY, Rendered, STORED } from '../content';

// A preview render: unsaved editor changes apply.
export default async function LivePage() {
  const page = await normalizeQuery(PAGE_QUERY, STORED, { enabled: true });
  return <Rendered page={page} />;
}
