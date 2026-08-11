import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  preprMiddleware,
  fetchPage,
  getToolbarProps,
  extractAccessToken,
} from './src/prepr.js';
import { preprFeatures } from './src/prepr-features.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const GRAPHQL_URL = process.env.PREPR_GRAPHQL_URL;
if (!GRAPHQL_URL) {
  console.error(
    'PREPR_GRAPHQL_URL is not set. Copy .env.example to .env and add your Prepr\n' +
      'GraphQL endpoint (Settings > Access tokens > GraphQL).',
  );
  process.exit(1);
}
// The toolkit reads no env vars of its own — you decide what "preview" means.
const IS_PREVIEW = process.env.NODE_ENV !== 'production';

const app = express();

app.set('view engine', 'ejs');
app.set('views', join(__dirname, 'views'));

app.use(express.static(join(__dirname, 'public')));
app.use(preprMiddleware({ preview: IS_PREVIEW, features: preprFeatures }));

app.get('/{*slug}', async (req, res) => {
  const rest = req.params.slug; // undefined at '/', else an array of path segments
  const slug = rest && rest.length ? rest.join('/') : '/';

  const page = await fetchPage(slug, res.locals.preprHeaders, GRAPHQL_URL);
  if (!page) return res.status(404).type('text/plain').send('Page not found');

  const toolbarProps = IS_PREVIEW
    ? await getToolbarProps(res.locals.preprHeaders, GRAPHQL_URL, preprFeatures)
    : null;

  res.render('page', {
    page,
    toolbarProps,
    // Serialized into the page so the client toolbar gets the same config.
    toolbarOptions: { features: preprFeatures },
    token: extractAccessToken(GRAPHQL_URL),
  });
});

app.listen(PORT, () => {
  console.log(`express example on http://localhost:${PORT} (preview: ${IS_PREVIEW})`);
});
