import { normalizeQuery } from '@preprio/toolkit/nextjs';

import { PAGE_QUERY, Rendered, STORED } from '../content';

// A production render: `enabled` is false, so nothing the browser sends can
// change it and the page stays statically prerendered.
export default async function StaticPage() {
  const page = await normalizeQuery(PAGE_QUERY, STORED, { enabled: false });
  return <Rendered page={page} />;
}
