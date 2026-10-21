// A page query and its stored result, shaped like a Prepr page with a
// single text-group component inside a section and an aliased enum.
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

export function Rendered({ page }: { page: typeof STORED }) {
  const [sideBySide, logos] = page.Page.sections as [
    (typeof STORED.Page.sections)[0],
    (typeof STORED.Page.sections)[1],
  ];
  const Heading = sideBySide.content?.headline_style === 'H1' ? 'h1' : 'h2';
  return (
    <main>
      <Heading>{sideBySide.content?.headline}</Heading>
      <p>logo-style:{logos.logoStyle}</p>
    </main>
  );
}
