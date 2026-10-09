// Shared schema and query fixtures for the variant transform test suites.
import { print } from 'graphql/language/printer.js';

import { toSchemaInfo, type PreprSchemaInfo } from './schema';

// A slice of a real Prepr schema: a page stack of components, a component
// (Cards) with a nested stack of *models*, and a component with personalized
// buttons. Field arguments mark which fields are personalizable.
export const ref = (name: string) => ({ name: null, ofType: { name } });
export const field = (name: string, type: string, personalize = false) => ({
  name,
  args: personalize ? [{ name: 'personalize' }] : [],
  type: ref(type),
});
export const schema: PreprSchemaInfo = toSchemaInfo({
  __schema: {
    queryType: { name: 'Query' },
    types: [
      {
        name: 'Query',
        fields: [{ ...field('Page', 'Page'), args: [{ name: 'slug' }] }],
      },
      {
        name: 'Page',
        fields: [
          field('_id', 'String'),
          field('_context', 'Context'),
          field('title', 'String'),
          field('content', 'Page_Content', true),
        ],
      },
      {
        name: 'Page_Content',
        possibleTypes: [
          { name: 'Hero' },
          { name: 'Cards' },
          { name: 'Banner' },
        ],
      },
      {
        name: 'Hero',
        fields: [
          field('_id', 'String'),
          field('_context', 'Context'),
          field('heading', 'String'),
          field('buttons', 'Button', true),
        ],
      },
      {
        name: 'Button',
        fields: [field('_context', 'Context'), field('text', 'String')],
      },
      {
        name: 'Cards',
        fields: [
          field('_id', 'String'),
          field('_context', 'Context'),
          field('cards', 'Cards_Cards', true),
        ],
      },
      {
        name: 'Cards_Cards',
        possibleTypes: [{ name: 'Post' }, { name: 'Product' }],
      },
      {
        name: 'Post',
        fields: [
          field('_id', 'String'),
          field('_context', 'Context'),
          field('title', 'String'),
        ],
      },
      {
        name: 'Product',
        fields: [
          field('_id', 'String'),
          field('_context', 'Context'),
          field('name', 'String'),
        ],
      },
      // No _context: never gets a context selection.
      { name: 'Banner', fields: [field('text', 'String')] },
      {
        name: 'Context',
        fields: [
          field('kind', 'String'),
          field('group_id', 'String'),
          field('variant_id', 'String'),
          field('variant_key', 'String'),
        ],
      },
    ],
  },
});

export const PAGE_QUERY = /* GraphQL */ `
  query GetPage($slug: String, $unused: String) {
    Page(slug: $slug) {
      title
      content {
        __typename
        ... on Hero {
          heading
          _context {
            variant_key
          }
          buttons {
            text
          }
        }
        ... on Cards {
          ...CardsFields
        }
      }
    }
  }
  fragment CardsFields on Cards {
    cards {
      ... on Post {
        title
      }
      ... on Product {
        name
      }
    }
  }
`;

export const compact = (document: unknown) =>
  print(document as never).replace(/\s+/g, ' ');
