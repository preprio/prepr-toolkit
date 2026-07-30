
import type { CodegenConfig } from '@graphql-codegen/cli';

/**
 * NOTE: Replace the schema URL below with your own Prepr GraphQL endpoint.
 * You can find your GraphQL URL in your Prepr project settings under Access tokens.
 * Format: https://graphql.prepr.io/<your-access-token>
 */
const config: CodegenConfig = {
  overwrite: true,
  schema: 'https://graphql.prepr.io/ac_5e48636ec968b4fe9b7490b0fc4f7702e51873418ae2acbc58c6431d9fe27429',
  documents: ['src/queries/**/*.graphql'],
  generates: {
    "src/gql/": {
      preset: 'client',
      plugins: [],
      presetConfig: {
        fragmentMasking: false,
      },
      config: {
        reactApolloVersion: 3,
      },
    },
    "./graphql.schema.json": {
      plugins: ["introspection"]
    }
  }
};

export default config;
