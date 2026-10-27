import type { CodegenConfig } from '@graphql-codegen/cli';
import { preprIds } from '@preprio/toolkit/codegen';

/**
 * Schema URL comes from the environment — it embeds an access token, so it must
 * never be committed. Copy .env.example to .env before running codegen.
 *
 * The generated `gql/` output is committed, so a build without credentials is
 * fine: codegen exits cleanly instead of failing the build.
 */
const schema = process.env.PREPR_GRAPHQL_URL;
if (!schema) {
  console.warn(
    '[codegen] PREPR_GRAPHQL_URL is not set — skipping codegen and using the ' +
      'committed gql/ output. Set it in .env to regenerate.',
  );
  process.exit(0);
}

const config: CodegenConfig = {
  overwrite: true,
  schema,
  documents: ['src/queries/**/*.graphql'],
  generates: {
    'src/gql/': {
      preset: 'client',
      // Selects `_id` and `__typename` wherever the schema has them, so live
      // preview and click-to-edit find every item without hand-written `_id`s.
      documentTransforms: [preprIds],
      plugins: [],
      presetConfig: { fragmentMasking: false },
      // Astro's strict tsconfig enables verbatimModuleSyntax — emit type-only
      // imports so the generated files (TypedDocumentNode) type-check.
      config: { useTypeImports: true },
    },
    './graphql.schema.json': { plugins: ['introspection'] },
  },
};

export default config;
