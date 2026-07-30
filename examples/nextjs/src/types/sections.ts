import { GetPageBySlugQuery } from '@/gql/graphql'

// Helper type to ensure _id is always present and required for each union member
// Uses distributive conditional types to handle unions correctly
type WithRequiredId<T> = T extends any
    ? T extends { _id: string }
        ? T
        : T extends { _id?: string | null }
          ? Omit<T, '_id'> & { _id: string }
          : T & { _id: string }
    : never

// Extract the content type from the GetPageBySlugQuery
type PageContentItem = NonNullable<GetPageBySlugQuery['Page']>['content'][number]

// Union of all possible content items with guaranteed _id field
export type SectionData = WithRequiredId<PageContentItem>

// Extract all possible typenames
export type SectionTypename = Exclude<SectionData['__typename'], 'undefined'>
