export const PAGE_QUERY = /* GraphQL */ `
  query Page {
    Page {
      _id
      sections {
        __typename
        ... on SideBySide {
          _id
          content {
            __typename
            ... on TextGroup {
              _id
              headline
              headline_style
            }
          }
        }
        ... on LogoGroup {
          _id
          logoStyle: style
        }
      }
    }
  }
`;

export const STORED = {
  Page: {
    _id: 'page-1',
    sections: [
      {
        __typename: 'SideBySide',
        _id: 'sbs-1',
        content: {
          __typename: 'TextGroup',
          _id: 'tg-1',
          headline: 'Stored headline',
          headline_style: 'H2',
        },
      },
      { __typename: 'LogoGroup', _id: 'logos-1', logoStyle: 'COLOR' },
    ],
  },
};
