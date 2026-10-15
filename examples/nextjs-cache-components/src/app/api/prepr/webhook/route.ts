import { createPreprWebhookRoute } from '@preprio/toolkit/nextjs';

// Prepr calls this on publish (Settings > Webhooks); it refreshes only the
// pages showing the changed item, tagged by `tagItems` in getPage.
export const POST = createPreprWebhookRoute({
  secret: process.env.PREPR_WEBHOOK_SECRET,
});
