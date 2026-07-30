import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  preprMiddleware,
  fetchPage,
  getToolbarProps,
  extractAccessToken,
} from './src/prepr.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const GRAPHQL_URL =
  process.env.PREPR_GRAPHQL_URL ||
  'https://graphql.prepr.io/ac_5e48636ec968b4fe9b7490b0fc4f7702e51873418ae2acbc58c6431d9fe27429';
// The toolkit reads no env vars of its own — you decide what "preview" means.
const IS_PREVIEW = process.env.NODE_ENV !== 'production';

const app = express();

app.set('view engine', 'ejs');
app.set('views', join(__dirname, 'views'));

app.use(express.static(join(__dirname, 'public')));
app.use(preprMiddleware({ preview: IS_PREVIEW }));

app.get('/{*slug}', async (req, res) => {
  const rest = req.params.slug; // undefined at '/', else an array of path segments
  const slug = rest && rest.length ? rest.join('/') : '/';

  const page = await fetchPage(slug, res.locals.preprHeaders, GRAPHQL_URL);
  if (!page) return res.status(404).type('text/plain').send('Page not found');

  const toolbarProps = IS_PREVIEW
    ? await getToolbarProps(res.locals.preprHeaders, GRAPHQL_URL)
    : null;

  res.render('page', { page, toolbarProps, token: extractAccessToken(GRAPHQL_URL) });
});

app.listen(PORT, () => {
  console.log(`express example on http://localhost:${PORT} (preview: ${IS_PREVIEW})`);
});
