import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  overwrite: true,
  schema:
    'https://graphql.prepr.io/ac_5e48636ec968b4fe9b7490b0fc4f7702e51873418ae2acbc58c6431d9fe27429',
  documents: ['src/queries/**/*.graphql'],
  generates: {
    'src/gql/': {
      preset: 'client',
      plugins: [],
      presetConfig: { fragmentMasking: false },
      // SvelteKit's strict tsconfig enables verbatimModuleSyntax — emit
      // type-only imports so the generated files (TypedDocumentNode)
      // type-check.
      config: { useTypeImports: true },
    },
    './graphql.schema.json': { plugins: ['introspection'] },
  },
};

export default config;
