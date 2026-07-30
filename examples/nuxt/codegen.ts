import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  overwrite: true,
  schema:
    'https://graphql.prepr.io/ac_5e48636ec968b4fe9b7490b0fc4f7702e51873418ae2acbc58c6431d9fe27429',
  documents: ['app/queries/**/*.graphql'],
  generates: {
    'app/gql/': {
      preset: 'client',
      plugins: [],
      presetConfig: { fragmentMasking: false },
      // Nuxt's generated tsconfig enables verbatimModuleSyntax — emit
      // type-only imports so the generated files (TypedDocumentNode)
      // type-check.
      config: { useTypeImports: true },
    },
    './graphql.schema.json': { plugins: ['introspection'] },
  },
};

export default config;
