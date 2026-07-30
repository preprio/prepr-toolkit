// Same GetPageBySlug as the next/astro examples, fragments inlined (no codegen).
export const GetPageBySlug = `
  query GetPageBySlug($slug: String) {
    Page(slug: $slug) {
      title
      _id
      content {
        __typename
        ... on Hero {
          _id
          heading
          sub_heading
          image { url(preset: "Hero", width: 2000) height width }
          _context { variant_key }
        }
        ... on Feature {
          _id
          heading
          sub_heading
          image_position
          image { url(width: 870, height: 570) }
          button { text }
          _context { variant_key }
        }
      }
    }
  }
`;
