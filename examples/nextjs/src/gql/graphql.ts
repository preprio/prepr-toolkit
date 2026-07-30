/* eslint-disable */
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  /** The `JSON` scalar type represents any JSON-serializable value, allowing for dynamic and structured data as per ECMA-404. */
  Json: { input: any; output: any; }
  /** The Locale type adheres to ISO i18n standard. For example: German in the Austria is represented as de-AT. */
  Locale: { input: any; output: any; }
  /** The DateTime type adheres to ISO 8601 standard. */
  _DateTime: { input: any; output: any; }
};

/** Embedded ActiveCampaign form. */
export type ActiveCampaignEmbed = {
  __typename?: 'ActiveCampaignEmbed';
  _id: Scalars['String']['output'];
  /** ActiveCampaign form ID */
  embed_id: Scalars['String']['output'];
};

/** This union type holds all content models. */
export type AllModels = Author | Category | Faq | Navigation | Page | Post | Product | Redirect;

export type ApplePodcast = {
  __typename?: 'ApplePodcast';
  _id: Scalars['String']['output'];
  url: Scalars['String']['output'];
};

/** Prepr Asset system model */
export type Asset = {
  __typename?: 'Asset';
  /** Unique identifier for each asset. */
  _id: Scalars['String']['output'];
  _locale: Scalars['String']['output'];
  /** This field returns all localizations for this asset. */
  _localizations: Array<Asset>;
  _type: Scalars['String']['output'];
  /** Contextual field; alignment of the asset when used in a content item. */
  alignment?: Maybe<AssetAlignment>;
  author?: Maybe<Scalars['String']['output']>;
  /** Contextual field; caption of the asset when used in a content item. */
  caption?: Maybe<Scalars['String']['output']>;
  /** Returns a cover image for audio/video files. */
  cover?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  duration?: Maybe<Scalars['Int']['output']>;
  file_size: Scalars['Int']['output'];
  /** The focal point coordinates (x, y) represent percentages of the image dimensions, ranging from 0 to 100. */
  focal_point?: Maybe<_FocalPoint>;
  height?: Maybe<Scalars['Int']['output']>;
  mime_type?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  original_name?: Maybe<Scalars['String']['output']>;
  /** Mux Playback ID for Audio & Video assets. */
  playback_id?: Maybe<Scalars['String']['output']>;
  url?: Maybe<Scalars['String']['output']>;
  width?: Maybe<Scalars['Int']['output']>;
};


/** Prepr Asset system model */
export type AssetCoverArgs = {
  animated?: InputMaybe<Scalars['Boolean']['input']>;
  end?: InputMaybe<Scalars['Float']['input']>;
  fit_mode?: InputMaybe<Scalars['String']['input']>;
  flip_h?: InputMaybe<Scalars['Boolean']['input']>;
  flip_v?: InputMaybe<Scalars['Boolean']['input']>;
  fps?: InputMaybe<Scalars['Int']['input']>;
  height?: InputMaybe<Scalars['Int']['input']>;
  rotate?: InputMaybe<Scalars['Int']['input']>;
  start?: InputMaybe<Scalars['Float']['input']>;
  time?: InputMaybe<Scalars['Float']['input']>;
  width?: InputMaybe<Scalars['Int']['input']>;
};


/** Prepr Asset system model */
export type AssetUrlArgs = {
  as_file?: InputMaybe<Scalars['Boolean']['input']>;
  crop?: InputMaybe<Scalars['String']['input']>;
  format?: InputMaybe<Scalars['String']['input']>;
  height?: InputMaybe<Scalars['Int']['input']>;
  inline?: InputMaybe<Scalars['Boolean']['input']>;
  preset?: InputMaybe<Scalars['String']['input']>;
  quality?: InputMaybe<Scalars['Int']['input']>;
  res?: InputMaybe<Scalars['String']['input']>;
  width?: InputMaybe<Scalars['Int']['input']>;
};

export enum AssetAlignment {
  Center = 'center',
  Left = 'left',
  Right = 'right'
}

/** Collection of assets used in a content item. */
export type Assets = {
  __typename?: 'Assets';
  _type?: Maybe<Scalars['String']['output']>;
  items?: Maybe<Array<Maybe<Asset>>>;
};

export type AssetsWhereInput = {
  _id_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

/** Single Author. */
export type Author = Model & {
  __typename?: 'Author';
  /** Count of bookmark events. */
  _bookmarks: Scalars['Int']['output'];
  /** The time the content item was changed. */
  _changed_on: Scalars['String']['output'];
  _context?: Maybe<Context>;
  /** The time the content item was created. */
  _created_on: Scalars['String']['output'];
  /** Id of your Prepr Environment. */
  _environment_id: Scalars['String']['output'];
  /** Count of view events. */
  _event: Scalars['Int']['output'];
  /** Unique identifier for each content item. */
  _id: Scalars['String']['output'];
  _last_published_on?: Maybe<Scalars['String']['output']>;
  /** Count of like events. */
  _likes: Scalars['Int']['output'];
  _locale: Scalars['String']['output'];
  _locales: Array<Scalars['String']['output']>;
  /** This field returns all localizations for this content item. */
  _localizations: Array<Author>;
  /** The time for when the content item is or will be published. */
  _publish_on?: Maybe<Scalars['String']['output']>;
  /** Calculated time to read in minutes. */
  _read_time?: Maybe<Scalars['Int']['output']>;
  /** Unique within Type, string identifier for each content item. */
  _slug?: Maybe<Scalars['String']['output']>;
  /** Count of subscribe events. */
  _subscribes: Scalars['Int']['output'];
  /** Count of view events. */
  _views: Scalars['Int']['output'];
  image?: Maybe<Asset>;
  name?: Maybe<Scalars['String']['output']>;
};


/** Single Author. */
export type Author_EventArgs = {
  name?: _Event;
};

export enum AuthorSortInput {
  ChangedOn = 'changed_on',
  ChangedOnAsc = 'changed_on_ASC',
  ChangedOnDesc = 'changed_on_DESC',
  CreatedOn = 'created_on',
  CreatedOnAsc = 'created_on_ASC',
  CreatedOnDesc = 'created_on_DESC',
  NameAsc = 'name_ASC',
  NameDesc = 'name_DESC',
  PublishOn = 'publish_on',
  PublishOnAsc = 'publish_on_ASC',
  PublishOnDesc = 'publish_on_DESC'
}

export type AuthorWhereInput = {
  _changed_on_gt?: InputMaybe<Scalars['_DateTime']['input']>;
  _changed_on_gte?: InputMaybe<Scalars['_DateTime']['input']>;
  _changed_on_lt?: InputMaybe<Scalars['_DateTime']['input']>;
  _changed_on_lte?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_gt?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_gte?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_lt?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_lte?: InputMaybe<Scalars['_DateTime']['input']>;
  /** Matches if the Id field is equal to one of the items in the given list. */
  _id_all?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches if the Id field is equal to one of the items in the given list. */
  _id_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches if the Id field is not equal to one of the items in the given list. */
  _id_nany?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** The `_or` filter returns a filter value if at least one of the clause in the _or is true. This beta filter currently supports the Id, Slug, Created On, Changed On, Published On, Text, Integer, Float, Boolean, and DateTime field types, for references only Text, Integer, Float, Boolean and exists (at least one item) fields are supported. */
  _or?: InputMaybe<Array<AuthorWhereInput>>;
  _publish_on_gt?: InputMaybe<Scalars['_DateTime']['input']>;
  _publish_on_gte?: InputMaybe<Scalars['_DateTime']['input']>;
  _publish_on_lt?: InputMaybe<Scalars['_DateTime']['input']>;
  _publish_on_lte?: InputMaybe<Scalars['_DateTime']['input']>;
  /** Matches any content item containing the given text term (full-text search). */
  _search?: InputMaybe<Scalars['String']['input']>;
  _search_options?: InputMaybe<SearchOptionsInput>;
  _slug_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  _slug_nany?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches any content item tagged with all items from the given list. */
  _tags_all?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches any content item tagged with at least one item from the given list. */
  _tags_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches any content item that is tagged. */
  _tags_has?: InputMaybe<Scalars['Boolean']['input']>;
  /** Matches any content item not tagged with an item from the given list. */
  _tags_nany?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  image?: InputMaybe<AssetsWhereInput>;
  /** Matches if the field is equal to the given value. */
  name?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field matches any of the given values. */
  name_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Full fuzzy text search, not case sensitive. */
  name_contains?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field ends with the given value. */
  name_ends_with?: InputMaybe<Scalars['String']['input']>;
  /** Excludes with full fuzzy text search, not case sensitive. */
  name_not_contains?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field starts with the given value. */
  name_starts_with?: InputMaybe<Scalars['String']['input']>;
};

/** List of Authors items. */
export type Authors = {
  __typename?: 'Authors';
  items: Array<Author>;
  total: Scalars['Int']['output'];
};

export type BlueskyPost = {
  __typename?: 'BlueskyPost';
  _id: Scalars['String']['output'];
  url: Scalars['String']['output'];
};

/** Button component. */
export type Button = Component & {
  __typename?: 'Button';
  _context?: Maybe<Context>;
  _id: Scalars['String']['output'];
  button_type?: Maybe<ButtonType>;
  external_url?: Maybe<Scalars['String']['output']>;
  link?: Maybe<Button_Link>;
  text?: Maybe<Scalars['String']['output']>;
  use_external_link?: Maybe<Scalars['Boolean']['output']>;
};

/** ButtonType. */
export enum ButtonType {
  /** Link */
  Link = 'LINK',
  /** Primary */
  Primary = 'PRIMARY',
  /** Secondary */
  Secondary = 'SECONDARY'
}

export type Button_Link = Category | Page | Post;

/** CTA component. */
export type Cta = Component & {
  __typename?: 'CTA';
  _context?: Maybe<Context>;
  _id: Scalars['String']['output'];
  heading?: Maybe<Scalars['String']['output']>;
  sub_heading?: Maybe<Scalars['String']['output']>;
};

/** Cards component. */
export type Cards = Component & {
  __typename?: 'Cards';
  _context?: Maybe<Context>;
  _id: Scalars['String']['output'];
  button?: Maybe<Button>;
  cards: Array<Cards_Cards>;
  heading?: Maybe<Scalars['String']['output']>;
  sub_heading?: Maybe<Scalars['String']['output']>;
  variant?: Maybe<CardsVariant>;
};


/** Cards component. */
export type CardsCardsArgs = {
  personalize?: Scalars['Boolean']['input'];
  personalize_for_segments?: InputMaybe<Array<Scalars['String']['input']>>;
};

/** CardsVariant. */
export enum CardsVariant {
  /** Blog */
  Blog = 'BLOG',
  /** Default */
  Default = 'DEFAULT'
}

export type Cards_Cards = Post | Product;

/** List of Categories items. */
export type Categories = {
  __typename?: 'Categories';
  items: Array<Category>;
  total: Scalars['Int']['output'];
};

/** Single Category. */
export type Category = Model & {
  __typename?: 'Category';
  /** Count of bookmark events. */
  _bookmarks: Scalars['Int']['output'];
  /** The time the content item was changed. */
  _changed_on: Scalars['String']['output'];
  _context?: Maybe<Context>;
  /** The time the content item was created. */
  _created_on: Scalars['String']['output'];
  /** Id of your Prepr Environment. */
  _environment_id: Scalars['String']['output'];
  /** Count of view events. */
  _event: Scalars['Int']['output'];
  /** Unique identifier for each content item. */
  _id: Scalars['String']['output'];
  _last_published_on?: Maybe<Scalars['String']['output']>;
  /** Count of like events. */
  _likes: Scalars['Int']['output'];
  _locale: Scalars['String']['output'];
  _locales: Array<Scalars['String']['output']>;
  /** This field returns all localizations for this content item. */
  _localizations: Array<Category>;
  /** The time for when the content item is or will be published. */
  _publish_on?: Maybe<Scalars['String']['output']>;
  /** Calculated time to read in minutes. */
  _read_time?: Maybe<Scalars['Int']['output']>;
  /** Unique within Type, string identifier for each content item. */
  _slug?: Maybe<Scalars['String']['output']>;
  /** Count of subscribe events. */
  _subscribes: Scalars['Int']['output'];
  /** Count of view events. */
  _views: Scalars['Int']['output'];
  name?: Maybe<Scalars['String']['output']>;
};


/** Single Category. */
export type Category_EventArgs = {
  name?: _Event;
};

export enum CategorySortInput {
  ChangedOn = 'changed_on',
  ChangedOnAsc = 'changed_on_ASC',
  ChangedOnDesc = 'changed_on_DESC',
  CreatedOn = 'created_on',
  CreatedOnAsc = 'created_on_ASC',
  CreatedOnDesc = 'created_on_DESC',
  NameAsc = 'name_ASC',
  NameDesc = 'name_DESC',
  PublishOn = 'publish_on',
  PublishOnAsc = 'publish_on_ASC',
  PublishOnDesc = 'publish_on_DESC'
}

export type CategoryWhereInput = {
  _changed_on_gt?: InputMaybe<Scalars['_DateTime']['input']>;
  _changed_on_gte?: InputMaybe<Scalars['_DateTime']['input']>;
  _changed_on_lt?: InputMaybe<Scalars['_DateTime']['input']>;
  _changed_on_lte?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_gt?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_gte?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_lt?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_lte?: InputMaybe<Scalars['_DateTime']['input']>;
  /** Matches if the Id field is equal to one of the items in the given list. */
  _id_all?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches if the Id field is equal to one of the items in the given list. */
  _id_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches if the Id field is not equal to one of the items in the given list. */
  _id_nany?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** The `_or` filter returns a filter value if at least one of the clause in the _or is true. This beta filter currently supports the Id, Slug, Created On, Changed On, Published On, Text, Integer, Float, Boolean, and DateTime field types, for references only Text, Integer, Float, Boolean and exists (at least one item) fields are supported. */
  _or?: InputMaybe<Array<CategoryWhereInput>>;
  _publish_on_gt?: InputMaybe<Scalars['_DateTime']['input']>;
  _publish_on_gte?: InputMaybe<Scalars['_DateTime']['input']>;
  _publish_on_lt?: InputMaybe<Scalars['_DateTime']['input']>;
  _publish_on_lte?: InputMaybe<Scalars['_DateTime']['input']>;
  /** Matches any content item containing the given text term (full-text search). */
  _search?: InputMaybe<Scalars['String']['input']>;
  _search_options?: InputMaybe<SearchOptionsInput>;
  _slug_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  _slug_nany?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches any content item tagged with all items from the given list. */
  _tags_all?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches any content item tagged with at least one item from the given list. */
  _tags_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches any content item that is tagged. */
  _tags_has?: InputMaybe<Scalars['Boolean']['input']>;
  /** Matches any content item not tagged with an item from the given list. */
  _tags_nany?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches if the field is equal to the given value. */
  name?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field matches any of the given values. */
  name_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Full fuzzy text search, not case sensitive. */
  name_contains?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field ends with the given value. */
  name_ends_with?: InputMaybe<Scalars['String']['input']>;
  /** Excludes with full fuzzy text search, not case sensitive. */
  name_not_contains?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field starts with the given value. */
  name_starts_with?: InputMaybe<Scalars['String']['input']>;
};

/** Remote Source CommerceProducts. */
export type CommerceProducts = {
  __typename?: 'CommerceProducts';
  /** Unique identifier for each remote source item, defined by the remote source. */
  _id: Scalars['String']['output'];
  /** This field returns the raw data content in JSON format retrieved from the remote source. */
  _json: Scalars['Json']['output'];
};

/** List of Remote Source CommerceProducts items in a Dynamic Content Field. */
export type CommerceProductsCollection = {
  __typename?: 'CommerceProductsCollection';
  /** A list of items. */
  items: Array<CommerceProducts>;
};

export type CommerceProductsWhereInput = {
  /** Matches if the Id field is equal to one of the items in the given list. */
  _id_any?: InputMaybe<Array<Scalars['String']['input']>>;
};

/** A component is a predefined set of fields that can be used in models. You can think of a component as a flexible, reusable template where you define fields once, and then fill them with different content every time you use it. */
export type Component = {
  _context?: Maybe<Context>;
  /** Unique identifier for each content component instance. */
  _id: Scalars['String']['output'];
};

/** Contact component. */
export type Contact = Component & {
  __typename?: 'Contact';
  _context?: Maybe<Context>;
  _id: Scalars['String']['output'];
  email?: Maybe<Scalars['String']['output']>;
  form_title?: Maybe<Scalars['String']['output']>;
  heading?: Maybe<Scalars['String']['output']>;
  hubspot_form_id?: Maybe<Scalars['String']['output']>;
  hubspot_portal_id?: Maybe<Scalars['String']['output']>;
  phone_number?: Maybe<Scalars['String']['output']>;
  sub_heading?: Maybe<Scalars['String']['output']>;
};

/** Content component. */
export type Content = Component & {
  __typename?: 'Content';
  _context?: Maybe<Context>;
  _id: Scalars['String']['output'];
  main_content?: Maybe<Array<Maybe<_Prepr_Types>>>;
  title?: Maybe<Scalars['String']['output']>;
};

export type ContentItems = {
  __typename?: 'ContentItems';
  items?: Maybe<Array<Maybe<AllModels>>>;
  total?: Maybe<Scalars['Int']['output']>;
};

export enum ContentItemsSortInput {
  ChangedOn = 'changed_on',
  ChangedOnDesc = 'changed_on_DESC',
  CreatedOn = 'created_on',
  CreatedOnDesc = 'created_on_DESC',
  /** Sort content items by most viewed. */
  Popular = 'popular',
  PublishOn = 'publish_on',
  PublishOnDesc = 'publish_on_DESC'
}

export type ContentItemsWhereInput = {
  _channels_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  _customer_relation?: InputMaybe<CustomerRelationWhereInput>;
  _id_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  _id_nany?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  _search?: InputMaybe<Scalars['String']['input']>;
  _search_options?: InputMaybe<SearchOptionsInput>;
  _slug_any?: InputMaybe<Array<Scalars['String']['input']>>;
  _tags_all?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  _tags_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  _tags_has?: InputMaybe<Scalars['Boolean']['input']>;
  _tags_nany?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  _typename_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type Context = {
  __typename?: 'Context';
  /** The unique identifier for an A/B test or personalization block used for analytics. */
  group_id?: Maybe<Scalars['String']['output']>;
  /** Returns the kind of personalized content: `PERSONALIZATION` | `AB_TEST`. */
  kind?: Maybe<Scalars['String']['output']>;
  segments?: Maybe<Array<Scalars['String']['output']>>;
  /** A variant ID is a unique identifier assigned to each variant in an A/B test (A/B) or personalization and contains the segments it has been linked too. */
  variant_id?: Maybe<Scalars['String']['output']>;
  /** The unique identifier for an A/B test or personalization variant used for analytics. */
  variant_key?: Maybe<Scalars['String']['output']>;
};

/** Represents a geolocation point with latitude and longitude. */
export type Coordinates = {
  __typename?: 'Coordinates';
  _id: Scalars['String']['output'];
  latitude: Scalars['Float']['output'];
  longitude: Scalars['Float']['output'];
};

export type CustomerRelationWhereInput = {
  event: _Event;
  id?: InputMaybe<Scalars['String']['input']>;
  reference_id?: InputMaybe<Scalars['String']['input']>;
};

/** Single FAQ. */
export type Faq = Model & {
  __typename?: 'FAQ';
  /** Count of bookmark events. */
  _bookmarks: Scalars['Int']['output'];
  /** The time the content item was changed. */
  _changed_on: Scalars['String']['output'];
  _context?: Maybe<Context>;
  /** The time the content item was created. */
  _created_on: Scalars['String']['output'];
  /** Id of your Prepr Environment. */
  _environment_id: Scalars['String']['output'];
  /** Count of view events. */
  _event: Scalars['Int']['output'];
  /** Unique identifier for each content item. */
  _id: Scalars['String']['output'];
  _last_published_on?: Maybe<Scalars['String']['output']>;
  /** Count of like events. */
  _likes: Scalars['Int']['output'];
  _locale: Scalars['String']['output'];
  _locales: Array<Scalars['String']['output']>;
  /** This field returns all localizations for this content item. */
  _localizations: Array<Faq>;
  /** The time for when the content item is or will be published. */
  _publish_on?: Maybe<Scalars['String']['output']>;
  /** Calculated time to read in minutes. */
  _read_time?: Maybe<Scalars['Int']['output']>;
  /** Unique within Type, string identifier for each content item. */
  _slug?: Maybe<Scalars['String']['output']>;
  /** Count of subscribe events. */
  _subscribes: Scalars['Int']['output'];
  /** Count of view events. */
  _views: Scalars['Int']['output'];
  internal_title?: Maybe<Scalars['String']['output']>;
  questions: Array<FaqQuestion>;
  title?: Maybe<Scalars['String']['output']>;
};


/** Single FAQ. */
export type Faq_EventArgs = {
  name?: _Event;
};


/** Single FAQ. */
export type FaqQuestionsArgs = {
  personalize?: Scalars['Boolean']['input'];
  personalize_for_country?: InputMaybe<Scalars['String']['input']>;
  personalize_for_segments?: InputMaybe<Array<Scalars['String']['input']>>;
};

/** FAQQuestion component. */
export type FaqQuestion = Component & {
  __typename?: 'FAQQuestion';
  _context?: Maybe<Context>;
  _id: Scalars['String']['output'];
  answer?: Maybe<Scalars['String']['output']>;
  question?: Maybe<Scalars['String']['output']>;
};

export enum FaqSortInput {
  ChangedOn = 'changed_on',
  ChangedOnAsc = 'changed_on_ASC',
  ChangedOnDesc = 'changed_on_DESC',
  CreatedOn = 'created_on',
  CreatedOnAsc = 'created_on_ASC',
  CreatedOnDesc = 'created_on_DESC',
  InternalTitleAsc = 'internal_title_ASC',
  InternalTitleDesc = 'internal_title_DESC',
  PublishOn = 'publish_on',
  PublishOnAsc = 'publish_on_ASC',
  PublishOnDesc = 'publish_on_DESC',
  TitleAsc = 'title_ASC',
  TitleDesc = 'title_DESC'
}

export type FaqWhereInput = {
  _changed_on_gt?: InputMaybe<Scalars['_DateTime']['input']>;
  _changed_on_gte?: InputMaybe<Scalars['_DateTime']['input']>;
  _changed_on_lt?: InputMaybe<Scalars['_DateTime']['input']>;
  _changed_on_lte?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_gt?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_gte?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_lt?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_lte?: InputMaybe<Scalars['_DateTime']['input']>;
  /** Matches if the Id field is equal to one of the items in the given list. */
  _id_all?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches if the Id field is equal to one of the items in the given list. */
  _id_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches if the Id field is not equal to one of the items in the given list. */
  _id_nany?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** The `_or` filter returns a filter value if at least one of the clause in the _or is true. This beta filter currently supports the Id, Slug, Created On, Changed On, Published On, Text, Integer, Float, Boolean, and DateTime field types, for references only Text, Integer, Float, Boolean and exists (at least one item) fields are supported. */
  _or?: InputMaybe<Array<FaqWhereInput>>;
  _publish_on_gt?: InputMaybe<Scalars['_DateTime']['input']>;
  _publish_on_gte?: InputMaybe<Scalars['_DateTime']['input']>;
  _publish_on_lt?: InputMaybe<Scalars['_DateTime']['input']>;
  _publish_on_lte?: InputMaybe<Scalars['_DateTime']['input']>;
  /** Matches any content item containing the given text term (full-text search). */
  _search?: InputMaybe<Scalars['String']['input']>;
  _search_options?: InputMaybe<SearchOptionsInput>;
  _slug_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  _slug_nany?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches any content item tagged with all items from the given list. */
  _tags_all?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches any content item tagged with at least one item from the given list. */
  _tags_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches any content item that is tagged. */
  _tags_has?: InputMaybe<Scalars['Boolean']['input']>;
  /** Matches any content item not tagged with an item from the given list. */
  _tags_nany?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches if the field is equal to the given value. */
  internal_title?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field matches any of the given values. */
  internal_title_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Full fuzzy text search, not case sensitive. */
  internal_title_contains?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field ends with the given value. */
  internal_title_ends_with?: InputMaybe<Scalars['String']['input']>;
  /** Excludes with full fuzzy text search, not case sensitive. */
  internal_title_not_contains?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field starts with the given value. */
  internal_title_starts_with?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field is equal to the given value. */
  title?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field matches any of the given values. */
  title_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Full fuzzy text search, not case sensitive. */
  title_contains?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field ends with the given value. */
  title_ends_with?: InputMaybe<Scalars['String']['input']>;
  /** Excludes with full fuzzy text search, not case sensitive. */
  title_not_contains?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field starts with the given value. */
  title_starts_with?: InputMaybe<Scalars['String']['input']>;
};

/** List of FAQs items. */
export type FaQs = {
  __typename?: 'FAQs';
  items: Array<Faq>;
  total: Scalars['Int']['output'];
};

export type FacebookPost = {
  __typename?: 'FacebookPost';
  _id: Scalars['String']['output'];
  url: Scalars['String']['output'];
};

/** Feature component. */
export type Feature = Component & {
  __typename?: 'Feature';
  _context?: Maybe<Context>;
  _id: Scalars['String']['output'];
  button?: Maybe<Button>;
  heading?: Maybe<Scalars['String']['output']>;
  image?: Maybe<Asset>;
  image_position?: Maybe<ImagePosition>;
  sub_heading?: Maybe<Scalars['String']['output']>;
};

/** Hero component. */
export type Hero = Component & {
  __typename?: 'Hero';
  _context?: Maybe<Context>;
  _id: Scalars['String']['output'];
  buttons: Array<Button>;
  heading?: Maybe<Scalars['String']['output']>;
  image?: Maybe<Asset>;
  sub_heading?: Maybe<Scalars['String']['output']>;
};


/** Hero component. */
export type HeroButtonsArgs = {
  personalize?: Scalars['Boolean']['input'];
  personalize_for_segments?: InputMaybe<Array<Scalars['String']['input']>>;
};

/** Embedded HubSpot form. */
export type HubSpotEmbed = {
  __typename?: 'HubSpotEmbed';
  _id: Scalars['String']['output'];
  /** HubSpot form ID */
  embed_id: Scalars['String']['output'];
};

/** ImagePosition. */
export enum ImagePosition {
  /** Left */
  Left = 'LEFT',
  /** Right */
  Right = 'RIGHT'
}

export type InstagramPost = {
  __typename?: 'InstagramPost';
  _id: Scalars['String']['output'];
  url: Scalars['String']['output'];
};

/** Embedded Jotform form. */
export type JotformEmbed = {
  __typename?: 'JotformEmbed';
  _id: Scalars['String']['output'];
  /** Jotform form ID */
  embed_id: Scalars['String']['output'];
};

/** A model is the content structure of a content item that is used in multiple locations in your CMS. A model consists of a number of fields to store your content. Common examples of models are articles, landing pages and products. */
export type Model = {
  /** The time the content item was changed. */
  _changed_on: Scalars['String']['output'];
  _context?: Maybe<Context>;
  /** The time the content item was created. */
  _created_on: Scalars['String']['output'];
  /** Unique identifier for each content item. */
  _id: Scalars['String']['output'];
  /** The time for when the content item is or will be published. */
  _publish_on?: Maybe<Scalars['String']['output']>;
  /** Calculated time to read in minutes. */
  _read_time?: Maybe<Scalars['Int']['output']>;
  /** Unique within Type, string identifier for each content item. */
  _slug?: Maybe<Scalars['String']['output']>;
};

/** Single Navigation. */
export type Navigation = Model & {
  __typename?: 'Navigation';
  /** Count of bookmark events. */
  _bookmarks: Scalars['Int']['output'];
  /** The time the content item was changed. */
  _changed_on: Scalars['String']['output'];
  _context?: Maybe<Context>;
  /** The time the content item was created. */
  _created_on: Scalars['String']['output'];
  /** Id of your Prepr Environment. */
  _environment_id: Scalars['String']['output'];
  /** Count of view events. */
  _event: Scalars['Int']['output'];
  /** Unique identifier for each content item. */
  _id: Scalars['String']['output'];
  _last_published_on?: Maybe<Scalars['String']['output']>;
  /** Count of like events. */
  _likes: Scalars['Int']['output'];
  _locale: Scalars['String']['output'];
  _locales: Array<Scalars['String']['output']>;
  /** This field returns all localizations for this content item. */
  _localizations: Array<Navigation>;
  /** The time for when the content item is or will be published. */
  _publish_on?: Maybe<Scalars['String']['output']>;
  /** Calculated time to read in minutes. */
  _read_time?: Maybe<Scalars['Int']['output']>;
  /** Unique within Type, string identifier for each content item. */
  _slug?: Maybe<Scalars['String']['output']>;
  /** Count of subscribe events. */
  _subscribes: Scalars['Int']['output'];
  /** Count of view events. */
  _views: Scalars['Int']['output'];
  internal_name?: Maybe<Scalars['String']['output']>;
  top_navigation: Array<Button>;
};


/** Single Navigation. */
export type Navigation_EventArgs = {
  name?: _Event;
};


/** Single Navigation. */
export type NavigationTop_NavigationArgs = {
  personalize?: Scalars['Boolean']['input'];
  personalize_for_country?: InputMaybe<Scalars['String']['input']>;
  personalize_for_segments?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type NavigationItem = {
  __typename?: 'NavigationItem';
  _id: Scalars['String']['output'];
  body?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  slug?: Maybe<Scalars['String']['output']>;
  title?: Maybe<Scalars['String']['output']>;
  url?: Maybe<Scalars['String']['output']>;
};

/** Single Page. */
export type Page = Model & {
  __typename?: 'Page';
  /** Count of bookmark events. */
  _bookmarks: Scalars['Int']['output'];
  /** The time the content item was changed. */
  _changed_on: Scalars['String']['output'];
  _context?: Maybe<Context>;
  /** The time the content item was created. */
  _created_on: Scalars['String']['output'];
  /** Id of your Prepr Environment. */
  _environment_id: Scalars['String']['output'];
  /** Count of view events. */
  _event: Scalars['Int']['output'];
  /** Unique identifier for each content item. */
  _id: Scalars['String']['output'];
  _last_published_on?: Maybe<Scalars['String']['output']>;
  /** Count of like events. */
  _likes: Scalars['Int']['output'];
  _locale: Scalars['String']['output'];
  _locales: Array<Scalars['String']['output']>;
  /** This field returns all localizations for this content item. */
  _localizations: Array<Page>;
  /** The time for when the content item is or will be published. */
  _publish_on?: Maybe<Scalars['String']['output']>;
  /** Calculated time to read in minutes. */
  _read_time?: Maybe<Scalars['Int']['output']>;
  /** Unique within Type, string identifier for each content item. */
  _slug?: Maybe<Scalars['String']['output']>;
  /** Count of subscribe events. */
  _subscribes: Scalars['Int']['output'];
  /** Count of view events. */
  _views: Scalars['Int']['output'];
  content: Array<Page_Content>;
  seo?: Maybe<Seo>;
  title?: Maybe<Scalars['String']['output']>;
};


/** Single Page. */
export type Page_EventArgs = {
  name?: _Event;
};


/** Single Page. */
export type PageContentArgs = {
  personalize?: Scalars['Boolean']['input'];
  personalize_for_country?: InputMaybe<Scalars['String']['input']>;
  personalize_for_segments?: InputMaybe<Array<Scalars['String']['input']>>;
};

export enum PageSortInput {
  ChangedOn = 'changed_on',
  ChangedOnAsc = 'changed_on_ASC',
  ChangedOnDesc = 'changed_on_DESC',
  CreatedOn = 'created_on',
  CreatedOnAsc = 'created_on_ASC',
  CreatedOnDesc = 'created_on_DESC',
  PublishOn = 'publish_on',
  PublishOnAsc = 'publish_on_ASC',
  PublishOnDesc = 'publish_on_DESC',
  TitleAsc = 'title_ASC',
  TitleDesc = 'title_DESC'
}

export type PageWhereInput = {
  _changed_on_gt?: InputMaybe<Scalars['_DateTime']['input']>;
  _changed_on_gte?: InputMaybe<Scalars['_DateTime']['input']>;
  _changed_on_lt?: InputMaybe<Scalars['_DateTime']['input']>;
  _changed_on_lte?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_gt?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_gte?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_lt?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_lte?: InputMaybe<Scalars['_DateTime']['input']>;
  /** Matches if the Id field is equal to one of the items in the given list. */
  _id_all?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches if the Id field is equal to one of the items in the given list. */
  _id_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches if the Id field is not equal to one of the items in the given list. */
  _id_nany?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** The `_or` filter returns a filter value if at least one of the clause in the _or is true. This beta filter currently supports the Id, Slug, Created On, Changed On, Published On, Text, Integer, Float, Boolean, and DateTime field types, for references only Text, Integer, Float, Boolean and exists (at least one item) fields are supported. */
  _or?: InputMaybe<Array<PageWhereInput>>;
  _publish_on_gt?: InputMaybe<Scalars['_DateTime']['input']>;
  _publish_on_gte?: InputMaybe<Scalars['_DateTime']['input']>;
  _publish_on_lt?: InputMaybe<Scalars['_DateTime']['input']>;
  _publish_on_lte?: InputMaybe<Scalars['_DateTime']['input']>;
  /** Matches any content item containing the given text term (full-text search). */
  _search?: InputMaybe<Scalars['String']['input']>;
  _search_options?: InputMaybe<SearchOptionsInput>;
  _slug_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  _slug_nany?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches any content item tagged with all items from the given list. */
  _tags_all?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches any content item tagged with at least one item from the given list. */
  _tags_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches any content item that is tagged. */
  _tags_has?: InputMaybe<Scalars['Boolean']['input']>;
  /** Matches any content item not tagged with an item from the given list. */
  _tags_nany?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Match items on ID, Slug or Typename of referenced content items. */
  content?: InputMaybe<Page_ContentWhereInput>;
  /** Matches if the field is equal to the given value. */
  title?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field matches any of the given values. */
  title_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Full fuzzy text search, not case sensitive. */
  title_contains?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field ends with the given value. */
  title_ends_with?: InputMaybe<Scalars['String']['input']>;
  /** Excludes with full fuzzy text search, not case sensitive. */
  title_not_contains?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field starts with the given value. */
  title_starts_with?: InputMaybe<Scalars['String']['input']>;
};

export type Page_Content = Cta | Cards | Contact | Content | Faq | Feature | Hero | Static;

export type Page_ContentWhereInput = {
  /** Matches if the Id field is equal to one of the items in the given list. */
  _id_all?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Matches if the Id field is equal to one of the items in the given list. */
  _id_any?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Matches if the Id field is not equal to one of the items in the given list. */
  _id_nany?: InputMaybe<Array<Scalars['String']['input']>>;
  _slug_any?: InputMaybe<Array<Scalars['String']['input']>>;
  _slug_nany?: InputMaybe<Array<Scalars['String']['input']>>;
  _typename_any?: InputMaybe<Array<Scalars['String']['input']>>;
};

/** List of Pages items. */
export type Pages = {
  __typename?: 'Pages';
  items: Array<Page>;
  total: Scalars['Int']['output'];
};

/** Embedded Pipedrive Web Form. */
export type PipedriveEmbed = {
  __typename?: 'PipedriveEmbed';
  _id: Scalars['String']['output'];
  /** Pipedrive Web Form URL */
  url: Scalars['String']['output'];
};

/** Single Post. */
export type Post = Model & {
  __typename?: 'Post';
  /** Count of bookmark events. */
  _bookmarks: Scalars['Int']['output'];
  /** The time the content item was changed. */
  _changed_on: Scalars['String']['output'];
  _context?: Maybe<Context>;
  /** The time the content item was created. */
  _created_on: Scalars['String']['output'];
  /** Id of your Prepr Environment. */
  _environment_id: Scalars['String']['output'];
  /** Count of view events. */
  _event: Scalars['Int']['output'];
  /** Unique identifier for each content item. */
  _id: Scalars['String']['output'];
  _last_published_on?: Maybe<Scalars['String']['output']>;
  /** Count of like events. */
  _likes: Scalars['Int']['output'];
  _locale: Scalars['String']['output'];
  _locales: Array<Scalars['String']['output']>;
  /** This field returns all localizations for this content item. */
  _localizations: Array<Post>;
  /** The time for when the content item is or will be published. */
  _publish_on?: Maybe<Scalars['String']['output']>;
  /** Calculated time to read in minutes. */
  _read_time?: Maybe<Scalars['Int']['output']>;
  /** Unique within Type, string identifier for each content item. */
  _slug?: Maybe<Scalars['String']['output']>;
  /** Count of subscribe events. */
  _subscribes: Scalars['Int']['output'];
  /** Count of view events. */
  _views: Scalars['Int']['output'];
  author?: Maybe<Author>;
  categories: Array<Category>;
  content?: Maybe<Array<Maybe<_Prepr_Types>>>;
  cover?: Maybe<Asset>;
  excerpt?: Maybe<Scalars['String']['output']>;
  seo?: Maybe<Seo>;
  title?: Maybe<Scalars['String']['output']>;
};


/** Single Post. */
export type Post_EventArgs = {
  name?: _Event;
};

export enum PostSortInput {
  ChangedOn = 'changed_on',
  ChangedOnAsc = 'changed_on_ASC',
  ChangedOnDesc = 'changed_on_DESC',
  CreatedOn = 'created_on',
  CreatedOnAsc = 'created_on_ASC',
  CreatedOnDesc = 'created_on_DESC',
  ExcerptAsc = 'excerpt_ASC',
  ExcerptDesc = 'excerpt_DESC',
  PublishOn = 'publish_on',
  PublishOnAsc = 'publish_on_ASC',
  PublishOnDesc = 'publish_on_DESC',
  TitleAsc = 'title_ASC',
  TitleDesc = 'title_DESC'
}

export type PostWhereInput = {
  _changed_on_gt?: InputMaybe<Scalars['_DateTime']['input']>;
  _changed_on_gte?: InputMaybe<Scalars['_DateTime']['input']>;
  _changed_on_lt?: InputMaybe<Scalars['_DateTime']['input']>;
  _changed_on_lte?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_gt?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_gte?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_lt?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_lte?: InputMaybe<Scalars['_DateTime']['input']>;
  /** Matches if the Id field is equal to one of the items in the given list. */
  _id_all?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches if the Id field is equal to one of the items in the given list. */
  _id_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches if the Id field is not equal to one of the items in the given list. */
  _id_nany?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** The `_or` filter returns a filter value if at least one of the clause in the _or is true. This beta filter currently supports the Id, Slug, Created On, Changed On, Published On, Text, Integer, Float, Boolean, and DateTime field types, for references only Text, Integer, Float, Boolean and exists (at least one item) fields are supported. */
  _or?: InputMaybe<Array<PostWhereInput>>;
  _publish_on_gt?: InputMaybe<Scalars['_DateTime']['input']>;
  _publish_on_gte?: InputMaybe<Scalars['_DateTime']['input']>;
  _publish_on_lt?: InputMaybe<Scalars['_DateTime']['input']>;
  _publish_on_lte?: InputMaybe<Scalars['_DateTime']['input']>;
  /** Matches any content item containing the given text term (full-text search). */
  _search?: InputMaybe<Scalars['String']['input']>;
  _search_options?: InputMaybe<SearchOptionsInput>;
  _slug_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  _slug_nany?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches any content item tagged with all items from the given list. */
  _tags_all?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches any content item tagged with at least one item from the given list. */
  _tags_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches any content item that is tagged. */
  _tags_has?: InputMaybe<Scalars['Boolean']['input']>;
  /** Matches any content item not tagged with an item from the given list. */
  _tags_nany?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Match on Author fields. */
  author?: InputMaybe<AuthorWhereInput>;
  /** Match on Category fields. */
  categories?: InputMaybe<CategoryWhereInput>;
  cover?: InputMaybe<AssetsWhereInput>;
  /** Matches if the field is equal to the given value. */
  excerpt?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field matches any of the given values. */
  excerpt_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Full fuzzy text search, not case sensitive. */
  excerpt_contains?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field ends with the given value. */
  excerpt_ends_with?: InputMaybe<Scalars['String']['input']>;
  /** Excludes with full fuzzy text search, not case sensitive. */
  excerpt_not_contains?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field starts with the given value. */
  excerpt_starts_with?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field is equal to the given value. */
  title?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field matches any of the given values. */
  title_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Full fuzzy text search, not case sensitive. */
  title_contains?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field ends with the given value. */
  title_ends_with?: InputMaybe<Scalars['String']['input']>;
  /** Excludes with full fuzzy text search, not case sensitive. */
  title_not_contains?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field starts with the given value. */
  title_starts_with?: InputMaybe<Scalars['String']['input']>;
};

/** List of Posts items. */
export type Posts = {
  __typename?: 'Posts';
  items: Array<Post>;
  total: Scalars['Int']['output'];
};

/** PriceSuffix. */
export enum PriceSuffix {
  /** MONTH */
  Month = 'MONTH',
  /** NONE */
  None = 'NONE'
}

/** Single Product. */
export type Product = Model & {
  __typename?: 'Product';
  /** Count of bookmark events. */
  _bookmarks: Scalars['Int']['output'];
  /** The time the content item was changed. */
  _changed_on: Scalars['String']['output'];
  _context?: Maybe<Context>;
  /** The time the content item was created. */
  _created_on: Scalars['String']['output'];
  /** Id of your Prepr Environment. */
  _environment_id: Scalars['String']['output'];
  /** Count of view events. */
  _event: Scalars['Int']['output'];
  /** Unique identifier for each content item. */
  _id: Scalars['String']['output'];
  _last_published_on?: Maybe<Scalars['String']['output']>;
  /** Count of like events. */
  _likes: Scalars['Int']['output'];
  _locale: Scalars['String']['output'];
  _locales: Array<Scalars['String']['output']>;
  /** This field returns all localizations for this content item. */
  _localizations: Array<Product>;
  /** The time for when the content item is or will be published. */
  _publish_on?: Maybe<Scalars['String']['output']>;
  /** Calculated time to read in minutes. */
  _read_time?: Maybe<Scalars['Int']['output']>;
  /** Unique within Type, string identifier for each content item. */
  _slug?: Maybe<Scalars['String']['output']>;
  /** Count of subscribe events. */
  _subscribes: Scalars['Int']['output'];
  /** Count of view events. */
  _views: Scalars['Int']['output'];
  categories: Array<Category>;
  content: Array<Product_Content>;
  e_commerce_product: Array<CommerceProducts>;
  excerpt?: Maybe<Scalars['String']['output']>;
  image?: Maybe<Asset>;
  name?: Maybe<Scalars['String']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
  price_suffix?: Maybe<PriceSuffix>;
  rating?: Maybe<Rating>;
  seo?: Maybe<Seo>;
};


/** Single Product. */
export type Product_EventArgs = {
  name?: _Event;
};


/** Single Product. */
export type ProductContentArgs = {
  personalize?: Scalars['Boolean']['input'];
  personalize_for_country?: InputMaybe<Scalars['String']['input']>;
  personalize_for_segments?: InputMaybe<Array<Scalars['String']['input']>>;
};

export enum ProductSortInput {
  ChangedOn = 'changed_on',
  ChangedOnAsc = 'changed_on_ASC',
  ChangedOnDesc = 'changed_on_DESC',
  CreatedOn = 'created_on',
  CreatedOnAsc = 'created_on_ASC',
  CreatedOnDesc = 'created_on_DESC',
  ExcerptAsc = 'excerpt_ASC',
  ExcerptDesc = 'excerpt_DESC',
  NameAsc = 'name_ASC',
  NameDesc = 'name_DESC',
  PriceAsc = 'price_ASC',
  PriceDesc = 'price_DESC',
  PriceSuffixAsc = 'price_suffix_ASC',
  PriceSuffixDesc = 'price_suffix_DESC',
  PublishOn = 'publish_on',
  PublishOnAsc = 'publish_on_ASC',
  PublishOnDesc = 'publish_on_DESC',
  RatingAsc = 'rating_ASC',
  RatingDesc = 'rating_DESC'
}

export type ProductWhereInput = {
  _changed_on_gt?: InputMaybe<Scalars['_DateTime']['input']>;
  _changed_on_gte?: InputMaybe<Scalars['_DateTime']['input']>;
  _changed_on_lt?: InputMaybe<Scalars['_DateTime']['input']>;
  _changed_on_lte?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_gt?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_gte?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_lt?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_lte?: InputMaybe<Scalars['_DateTime']['input']>;
  /** Matches if the Id field is equal to one of the items in the given list. */
  _id_all?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches if the Id field is equal to one of the items in the given list. */
  _id_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches if the Id field is not equal to one of the items in the given list. */
  _id_nany?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** The `_or` filter returns a filter value if at least one of the clause in the _or is true. This beta filter currently supports the Id, Slug, Created On, Changed On, Published On, Text, Integer, Float, Boolean, and DateTime field types, for references only Text, Integer, Float, Boolean and exists (at least one item) fields are supported. */
  _or?: InputMaybe<Array<ProductWhereInput>>;
  _publish_on_gt?: InputMaybe<Scalars['_DateTime']['input']>;
  _publish_on_gte?: InputMaybe<Scalars['_DateTime']['input']>;
  _publish_on_lt?: InputMaybe<Scalars['_DateTime']['input']>;
  _publish_on_lte?: InputMaybe<Scalars['_DateTime']['input']>;
  /** Matches any content item containing the given text term (full-text search). */
  _search?: InputMaybe<Scalars['String']['input']>;
  _search_options?: InputMaybe<SearchOptionsInput>;
  _slug_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  _slug_nany?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches any content item tagged with all items from the given list. */
  _tags_all?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches any content item tagged with at least one item from the given list. */
  _tags_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches any content item that is tagged. */
  _tags_has?: InputMaybe<Scalars['Boolean']['input']>;
  /** Matches any content item not tagged with an item from the given list. */
  _tags_nany?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Match on Category fields. */
  categories?: InputMaybe<CategoryWhereInput>;
  /** Match items on ID, Slug or Typename of referenced content items. */
  content?: InputMaybe<Product_ContentWhereInput>;
  /** Match on CommerceProducts fields. */
  e_commerce_product?: InputMaybe<CommerceProductsWhereInput>;
  /** Matches if the field is equal to the given value. */
  excerpt?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field matches any of the given values. */
  excerpt_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Full fuzzy text search, not case sensitive. */
  excerpt_contains?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field ends with the given value. */
  excerpt_ends_with?: InputMaybe<Scalars['String']['input']>;
  /** Excludes with full fuzzy text search, not case sensitive. */
  excerpt_not_contains?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field starts with the given value. */
  excerpt_starts_with?: InputMaybe<Scalars['String']['input']>;
  image?: InputMaybe<AssetsWhereInput>;
  /** Matches if the field is equal to the given value. */
  name?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field matches any of the given values. */
  name_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Full fuzzy text search, not case sensitive. */
  name_contains?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field ends with the given value. */
  name_ends_with?: InputMaybe<Scalars['String']['input']>;
  /** Excludes with full fuzzy text search, not case sensitive. */
  name_not_contains?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field starts with the given value. */
  name_starts_with?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field is equal to the given value. */
  price?: InputMaybe<Scalars['Float']['input']>;
  /** Matches if the field is greater than the given value. */
  price_gt?: InputMaybe<Scalars['Float']['input']>;
  /** Matches if the field is greater than or equal to the given value. */
  price_gte?: InputMaybe<Scalars['Float']['input']>;
  /** Matches if the field is less than the given value. */
  price_lt?: InputMaybe<Scalars['Float']['input']>;
  /** Matches if the field is less than or equal to the given value. */
  price_lte?: InputMaybe<Scalars['Float']['input']>;
  /** Matches if the field is equal to the given value. */
  price_suffix?: InputMaybe<PriceSuffix>;
  /** Matches if the field is one of the given values. */
  price_suffix_any?: InputMaybe<Array<InputMaybe<PriceSuffix>>>;
  /** Matches if the field ends with the given value. */
  price_suffix_ends_with?: InputMaybe<PriceSuffix>;
  /** Matches if the field starts with the given value. */
  price_suffix_starts_with?: InputMaybe<PriceSuffix>;
  /** Matches if the field is equal to the given value. */
  rating?: InputMaybe<Rating>;
  /** Matches if the field is one of the given values. */
  rating_any?: InputMaybe<Array<InputMaybe<Rating>>>;
  /** Matches if the field ends with the given value. */
  rating_ends_with?: InputMaybe<Rating>;
  /** Matches if the field starts with the given value. */
  rating_starts_with?: InputMaybe<Rating>;
};

export type Product_Content = Cta | Cards | Contact | Faq | Feature | Static;

export type Product_ContentWhereInput = {
  /** Matches if the Id field is equal to one of the items in the given list. */
  _id_all?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Matches if the Id field is equal to one of the items in the given list. */
  _id_any?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Matches if the Id field is not equal to one of the items in the given list. */
  _id_nany?: InputMaybe<Array<Scalars['String']['input']>>;
  _slug_any?: InputMaybe<Array<Scalars['String']['input']>>;
  _slug_nany?: InputMaybe<Array<Scalars['String']['input']>>;
  _typename_any?: InputMaybe<Array<Scalars['String']['input']>>;
};

/** List of Products items. */
export type Products = {
  __typename?: 'Products';
  items: Array<Product>;
  total: Scalars['Int']['output'];
};

export type Query = {
  __typename?: 'Query';
  /** Retrieve a single Author. */
  Author?: Maybe<Author>;
  /** Retrieve multiple Authors. */
  Authors?: Maybe<Authors>;
  /** Retrieve multiple Categories. */
  Categories?: Maybe<Categories>;
  /** Retrieve a single Category. */
  Category?: Maybe<Category>;
  /** Retrieve items from different model types at once. */
  ContentItems?: Maybe<ContentItems>;
  /** Retrieve a single FAQ. */
  FAQ?: Maybe<Faq>;
  /** Retrieve multiple FAQs. */
  FAQs?: Maybe<FaQs>;
  /** Retrieve Navigation. */
  Navigation?: Maybe<Navigation>;
  /** Retrieve a single Page. */
  Page?: Maybe<Page>;
  /** Retrieve multiple Pages. */
  Pages?: Maybe<Pages>;
  /** Recommendation recipe suitable for recommending Authors which are similar to the giving item */
  PeopleAlsoViewed_Authors?: Maybe<Authors>;
  /** Recommendation recipe suitable for recommending Categories which are similar to the giving item */
  PeopleAlsoViewed_Categories?: Maybe<Categories>;
  /** Recommendation recipe suitable for recommending FAQs which are similar to the giving item */
  PeopleAlsoViewed_FAQs?: Maybe<FaQs>;
  /** Recommendation recipe suitable for recommending Pages which are similar to the giving item */
  PeopleAlsoViewed_Pages?: Maybe<Pages>;
  /** Recommendation recipe suitable for recommending Posts which are similar to the giving item */
  PeopleAlsoViewed_Posts?: Maybe<Posts>;
  /** Recommendation recipe suitable for recommending Products which are similar to the giving item */
  PeopleAlsoViewed_Products?: Maybe<Products>;
  /** Recommendation recipe suitable for recommending Redirects which are similar to the giving item */
  PeopleAlsoViewed_Redirects?: Maybe<Redirects>;
  /** Recommendation recipe suitable for recommending globally popular Authors */
  Popular_Authors?: Maybe<Authors>;
  /** Recommendation recipe suitable for recommending globally popular Categories */
  Popular_Categories?: Maybe<Categories>;
  /** Recommendation recipe suitable for recommending globally popular FAQs */
  Popular_FAQs?: Maybe<FaQs>;
  /** Recommendation recipe suitable for recommending globally popular Pages */
  Popular_Pages?: Maybe<Pages>;
  /** Recommendation recipe suitable for recommending globally popular Posts */
  Popular_Posts?: Maybe<Posts>;
  /** Recommendation recipe suitable for recommending globally popular Products */
  Popular_Products?: Maybe<Products>;
  /** Recommendation recipe suitable for recommending globally popular Redirects */
  Popular_Redirects?: Maybe<Redirects>;
  /** Retrieve a single Post. */
  Post?: Maybe<Post>;
  /** Retrieve multiple Posts. */
  Posts?: Maybe<Posts>;
  /** Retrieve a single Product. */
  Product?: Maybe<Product>;
  /** Retrieve multiple Products. */
  Products?: Maybe<Products>;
  /** Retrieve a single Redirect. */
  Redirect?: Maybe<Redirect>;
  /** Retrieve multiple Redirects. */
  Redirects?: Maybe<Redirects>;
  /** Recommendation recipe suitable for recommending Authors which are similar to the giving item */
  Similar_Authors?: Maybe<Authors>;
  /** Recommendation recipe suitable for recommending Categories which are similar to the giving item */
  Similar_Categories?: Maybe<Categories>;
  /** Recommendation recipe suitable for recommending FAQs which are similar to the giving item */
  Similar_FAQs?: Maybe<FaQs>;
  /** Recommendation recipe suitable for recommending Pages which are similar to the giving item */
  Similar_Pages?: Maybe<Pages>;
  /** Recommendation recipe suitable for recommending Posts which are similar to the giving item */
  Similar_Posts?: Maybe<Posts>;
  /** Recommendation recipe suitable for recommending Products which are similar to the giving item */
  Similar_Products?: Maybe<Products>;
  /** Recommendation recipe suitable for recommending Redirects which are similar to the giving item */
  Similar_Redirects?: Maybe<Redirects>;
  /** Retrieve the list of available locales. */
  _Locales?: Maybe<Array<Scalars['Locale']['output']>>;
  /** Retrieve the list of Prepr segments for the Preview Next.js preview bar. */
  _Segments?: Maybe<Array<_Segment>>;
};


export type QueryAuthorArgs = {
  id?: InputMaybe<Scalars['String']['input']>;
  locale?: Scalars['String']['input'];
  locales?: InputMaybe<Array<Scalars['String']['input']>>;
  slug?: InputMaybe<Scalars['String']['input']>;
};


export type QueryAuthorsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: Scalars['String']['input'];
  locales?: InputMaybe<Array<Scalars['String']['input']>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<AuthorSortInput>;
  where?: InputMaybe<AuthorWhereInput>;
};


export type QueryCategoriesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: Scalars['String']['input'];
  locales?: InputMaybe<Array<Scalars['String']['input']>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<CategorySortInput>;
  where?: InputMaybe<CategoryWhereInput>;
};


export type QueryCategoryArgs = {
  id?: InputMaybe<Scalars['String']['input']>;
  locale?: Scalars['String']['input'];
  locales?: InputMaybe<Array<Scalars['String']['input']>>;
  slug?: InputMaybe<Scalars['String']['input']>;
};


export type QueryContentItemsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: InputMaybe<Scalars['String']['input']>;
  people_also_viewed_id?: InputMaybe<Scalars['String']['input']>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<ContentItemsSortInput>;
  where?: InputMaybe<ContentItemsWhereInput>;
};


export type QueryFaqArgs = {
  id?: InputMaybe<Scalars['String']['input']>;
  locale?: Scalars['String']['input'];
  locales?: InputMaybe<Array<Scalars['String']['input']>>;
  slug?: InputMaybe<Scalars['String']['input']>;
};


export type QueryFaQsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: Scalars['String']['input'];
  locales?: InputMaybe<Array<Scalars['String']['input']>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<FaqSortInput>;
  where?: InputMaybe<FaqWhereInput>;
};


export type QueryNavigationArgs = {
  locale?: InputMaybe<Scalars['String']['input']>;
  locales?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};


export type QueryPageArgs = {
  id?: InputMaybe<Scalars['String']['input']>;
  locale?: Scalars['String']['input'];
  locales?: InputMaybe<Array<Scalars['String']['input']>>;
  slug?: InputMaybe<Scalars['String']['input']>;
};


export type QueryPagesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: Scalars['String']['input'];
  locales?: InputMaybe<Array<Scalars['String']['input']>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<PageSortInput>;
  where?: InputMaybe<PageWhereInput>;
};


export type QueryPeopleAlsoViewed_AuthorsArgs = {
  id: Scalars['String']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: InputMaybe<Scalars['String']['input']>;
  locales?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  rules?: InputMaybe<SimilarRulesInput>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<AuthorWhereInput>;
};


export type QueryPeopleAlsoViewed_CategoriesArgs = {
  id: Scalars['String']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: InputMaybe<Scalars['String']['input']>;
  locales?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  rules?: InputMaybe<SimilarRulesInput>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<CategoryWhereInput>;
};


export type QueryPeopleAlsoViewed_FaQsArgs = {
  id: Scalars['String']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: InputMaybe<Scalars['String']['input']>;
  locales?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  rules?: InputMaybe<SimilarRulesInput>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<FaqWhereInput>;
};


export type QueryPeopleAlsoViewed_PagesArgs = {
  id: Scalars['String']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: InputMaybe<Scalars['String']['input']>;
  locales?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  rules?: InputMaybe<SimilarRulesInput>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<PageWhereInput>;
};


export type QueryPeopleAlsoViewed_PostsArgs = {
  id: Scalars['String']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: InputMaybe<Scalars['String']['input']>;
  locales?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  rules?: InputMaybe<SimilarRulesInput>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<PostWhereInput>;
};


export type QueryPeopleAlsoViewed_ProductsArgs = {
  id: Scalars['String']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: InputMaybe<Scalars['String']['input']>;
  locales?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  rules?: InputMaybe<SimilarRulesInput>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ProductWhereInput>;
};


export type QueryPeopleAlsoViewed_RedirectsArgs = {
  id: Scalars['String']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: InputMaybe<Scalars['String']['input']>;
  locales?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  rules?: InputMaybe<SimilarRulesInput>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<RedirectWhereInput>;
};


export type QueryPopular_AuthorsArgs = {
  events?: InputMaybe<Array<InputMaybe<_Event>>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: InputMaybe<Scalars['String']['input']>;
  locales?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<AuthorWhereInput>;
};


export type QueryPopular_CategoriesArgs = {
  events?: InputMaybe<Array<InputMaybe<_Event>>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: InputMaybe<Scalars['String']['input']>;
  locales?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<CategoryWhereInput>;
};


export type QueryPopular_FaQsArgs = {
  events?: InputMaybe<Array<InputMaybe<_Event>>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: InputMaybe<Scalars['String']['input']>;
  locales?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<FaqWhereInput>;
};


export type QueryPopular_PagesArgs = {
  events?: InputMaybe<Array<InputMaybe<_Event>>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: InputMaybe<Scalars['String']['input']>;
  locales?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<PageWhereInput>;
};


export type QueryPopular_PostsArgs = {
  events?: InputMaybe<Array<InputMaybe<_Event>>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: InputMaybe<Scalars['String']['input']>;
  locales?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<PostWhereInput>;
};


export type QueryPopular_ProductsArgs = {
  events?: InputMaybe<Array<InputMaybe<_Event>>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: InputMaybe<Scalars['String']['input']>;
  locales?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ProductWhereInput>;
};


export type QueryPopular_RedirectsArgs = {
  events?: InputMaybe<Array<InputMaybe<_Event>>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: InputMaybe<Scalars['String']['input']>;
  locales?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<RedirectWhereInput>;
};


export type QueryPostArgs = {
  id?: InputMaybe<Scalars['String']['input']>;
  locale?: Scalars['String']['input'];
  locales?: InputMaybe<Array<Scalars['String']['input']>>;
  slug?: InputMaybe<Scalars['String']['input']>;
};


export type QueryPostsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: Scalars['String']['input'];
  locales?: InputMaybe<Array<Scalars['String']['input']>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<PostSortInput>;
  where?: InputMaybe<PostWhereInput>;
};


export type QueryProductArgs = {
  id?: InputMaybe<Scalars['String']['input']>;
  locale?: Scalars['String']['input'];
  locales?: InputMaybe<Array<Scalars['String']['input']>>;
  slug?: InputMaybe<Scalars['String']['input']>;
};


export type QueryProductsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: Scalars['String']['input'];
  locales?: InputMaybe<Array<Scalars['String']['input']>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<ProductSortInput>;
  where?: InputMaybe<ProductWhereInput>;
};


export type QueryRedirectArgs = {
  id?: InputMaybe<Scalars['String']['input']>;
  locale?: Scalars['String']['input'];
  locales?: InputMaybe<Array<Scalars['String']['input']>>;
  slug?: InputMaybe<Scalars['String']['input']>;
};


export type QueryRedirectsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: Scalars['String']['input'];
  locales?: InputMaybe<Array<Scalars['String']['input']>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<RedirectSortInput>;
  where?: InputMaybe<RedirectWhereInput>;
};


export type QuerySimilar_AuthorsArgs = {
  id: Scalars['String']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: InputMaybe<Scalars['String']['input']>;
  locales?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  rules?: InputMaybe<SimilarRulesInput>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<AuthorWhereInput>;
};


export type QuerySimilar_CategoriesArgs = {
  id: Scalars['String']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: InputMaybe<Scalars['String']['input']>;
  locales?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  rules?: InputMaybe<SimilarRulesInput>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<CategoryWhereInput>;
};


export type QuerySimilar_FaQsArgs = {
  id: Scalars['String']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: InputMaybe<Scalars['String']['input']>;
  locales?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  rules?: InputMaybe<SimilarRulesInput>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<FaqWhereInput>;
};


export type QuerySimilar_PagesArgs = {
  id: Scalars['String']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: InputMaybe<Scalars['String']['input']>;
  locales?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  rules?: InputMaybe<SimilarRulesInput>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<PageWhereInput>;
};


export type QuerySimilar_PostsArgs = {
  id: Scalars['String']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: InputMaybe<Scalars['String']['input']>;
  locales?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  rules?: InputMaybe<SimilarRulesInput>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<PostWhereInput>;
};


export type QuerySimilar_ProductsArgs = {
  id: Scalars['String']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: InputMaybe<Scalars['String']['input']>;
  locales?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  rules?: InputMaybe<SimilarRulesInput>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ProductWhereInput>;
};


export type QuerySimilar_RedirectsArgs = {
  id: Scalars['String']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  locale?: InputMaybe<Scalars['String']['input']>;
  locales?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  rules?: InputMaybe<SimilarRulesInput>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<RedirectWhereInput>;
};

export type Quote = {
  __typename?: 'Quote';
  _id: Scalars['String']['output'];
  author?: Maybe<Scalars['String']['output']>;
  body?: Maybe<Scalars['String']['output']>;
};

/** Rating. */
export enum Rating {
  /** 5 */
  Five = 'FIVE',
  /** 4 */
  Four = 'FOUR',
  /** 1 */
  One = 'ONE',
  /** 3 */
  Three = 'THREE',
  /** 2 */
  Two = 'TWO'
}

/** Single Redirect. */
export type Redirect = Model & {
  __typename?: 'Redirect';
  /** Count of bookmark events. */
  _bookmarks: Scalars['Int']['output'];
  /** The time the content item was changed. */
  _changed_on: Scalars['String']['output'];
  _context?: Maybe<Context>;
  /** The time the content item was created. */
  _created_on: Scalars['String']['output'];
  /** Id of your Prepr Environment. */
  _environment_id: Scalars['String']['output'];
  /** Count of view events. */
  _event: Scalars['Int']['output'];
  /** Unique identifier for each content item. */
  _id: Scalars['String']['output'];
  _last_published_on?: Maybe<Scalars['String']['output']>;
  /** Count of like events. */
  _likes: Scalars['Int']['output'];
  _locale: Scalars['String']['output'];
  _locales: Array<Scalars['String']['output']>;
  /** This field returns all localizations for this content item. */
  _localizations: Array<Redirect>;
  /** The time for when the content item is or will be published. */
  _publish_on?: Maybe<Scalars['String']['output']>;
  /** Calculated time to read in minutes. */
  _read_time?: Maybe<Scalars['Int']['output']>;
  /** Unique within Type, string identifier for each content item. */
  _slug?: Maybe<Scalars['String']['output']>;
  /** Count of subscribe events. */
  _subscribes: Scalars['Int']['output'];
  /** Count of view events. */
  _views: Scalars['Int']['output'];
  destination: Array<Redirect_Destination>;
  internal_title?: Maybe<Scalars['String']['output']>;
  redirect_type?: Maybe<RedirectType>;
};


/** Single Redirect. */
export type Redirect_EventArgs = {
  name?: _Event;
};

export enum RedirectSortInput {
  ChangedOn = 'changed_on',
  ChangedOnAsc = 'changed_on_ASC',
  ChangedOnDesc = 'changed_on_DESC',
  CreatedOn = 'created_on',
  CreatedOnAsc = 'created_on_ASC',
  CreatedOnDesc = 'created_on_DESC',
  InternalTitleAsc = 'internal_title_ASC',
  InternalTitleDesc = 'internal_title_DESC',
  PublishOn = 'publish_on',
  PublishOnAsc = 'publish_on_ASC',
  PublishOnDesc = 'publish_on_DESC',
  RedirectTypeAsc = 'redirect_type_ASC',
  RedirectTypeDesc = 'redirect_type_DESC'
}

/** RedirectType. */
export enum RedirectType {
  /** Permanent (301) */
  Permanent = 'PERMANENT',
  /** Temporary (302) */
  Temporary = 'TEMPORARY'
}

export type RedirectWhereInput = {
  _changed_on_gt?: InputMaybe<Scalars['_DateTime']['input']>;
  _changed_on_gte?: InputMaybe<Scalars['_DateTime']['input']>;
  _changed_on_lt?: InputMaybe<Scalars['_DateTime']['input']>;
  _changed_on_lte?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_gt?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_gte?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_lt?: InputMaybe<Scalars['_DateTime']['input']>;
  _created_on_lte?: InputMaybe<Scalars['_DateTime']['input']>;
  /** Matches if the Id field is equal to one of the items in the given list. */
  _id_all?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches if the Id field is equal to one of the items in the given list. */
  _id_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches if the Id field is not equal to one of the items in the given list. */
  _id_nany?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** The `_or` filter returns a filter value if at least one of the clause in the _or is true. This beta filter currently supports the Id, Slug, Created On, Changed On, Published On, Text, Integer, Float, Boolean, and DateTime field types, for references only Text, Integer, Float, Boolean and exists (at least one item) fields are supported. */
  _or?: InputMaybe<Array<RedirectWhereInput>>;
  _publish_on_gt?: InputMaybe<Scalars['_DateTime']['input']>;
  _publish_on_gte?: InputMaybe<Scalars['_DateTime']['input']>;
  _publish_on_lt?: InputMaybe<Scalars['_DateTime']['input']>;
  _publish_on_lte?: InputMaybe<Scalars['_DateTime']['input']>;
  /** Matches any content item containing the given text term (full-text search). */
  _search?: InputMaybe<Scalars['String']['input']>;
  _search_options?: InputMaybe<SearchOptionsInput>;
  _slug_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  _slug_nany?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches any content item tagged with all items from the given list. */
  _tags_all?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches any content item tagged with at least one item from the given list. */
  _tags_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Matches any content item that is tagged. */
  _tags_has?: InputMaybe<Scalars['Boolean']['input']>;
  /** Matches any content item not tagged with an item from the given list. */
  _tags_nany?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Match items on ID, Slug or Typename of referenced content items. */
  destination?: InputMaybe<Redirect_DestinationWhereInput>;
  /** Matches if the field is equal to the given value. */
  internal_title?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field matches any of the given values. */
  internal_title_any?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  /** Full fuzzy text search, not case sensitive. */
  internal_title_contains?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field ends with the given value. */
  internal_title_ends_with?: InputMaybe<Scalars['String']['input']>;
  /** Excludes with full fuzzy text search, not case sensitive. */
  internal_title_not_contains?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field starts with the given value. */
  internal_title_starts_with?: InputMaybe<Scalars['String']['input']>;
  /** Matches if the field is equal to the given value. */
  redirect_type?: InputMaybe<RedirectType>;
  /** Matches if the field is one of the given values. */
  redirect_type_any?: InputMaybe<Array<InputMaybe<RedirectType>>>;
  /** Matches if the field ends with the given value. */
  redirect_type_ends_with?: InputMaybe<RedirectType>;
  /** Matches if the field starts with the given value. */
  redirect_type_starts_with?: InputMaybe<RedirectType>;
};

export type Redirect_Destination = Page | Post | Product;

export type Redirect_DestinationWhereInput = {
  /** Matches if the Id field is equal to one of the items in the given list. */
  _id_all?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Matches if the Id field is equal to one of the items in the given list. */
  _id_any?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Matches if the Id field is not equal to one of the items in the given list. */
  _id_nany?: InputMaybe<Array<Scalars['String']['input']>>;
  _slug_any?: InputMaybe<Array<Scalars['String']['input']>>;
  _slug_nany?: InputMaybe<Array<Scalars['String']['input']>>;
  _typename_any?: InputMaybe<Array<Scalars['String']['input']>>;
};

/** List of Redirects items. */
export type Redirects = {
  __typename?: 'Redirects';
  items: Array<Redirect>;
  total: Scalars['Int']['output'];
};

export type Resource = {
  __typename?: 'Resource';
  _id: Scalars['String']['output'];
  body?: Maybe<Scalars['String']['output']>;
  type?: Maybe<Scalars['String']['output']>;
  url?: Maybe<Scalars['String']['output']>;
};

/** SEO component. */
export type Seo = Component & {
  __typename?: 'SEO';
  _context?: Maybe<Context>;
  _id: Scalars['String']['output'];
  meta_description?: Maybe<Scalars['String']['output']>;
  meta_image?: Maybe<Asset>;
  meta_title?: Maybe<Scalars['String']['output']>;
};

export type SearchOptionsInput = {
  includeNumeric?: InputMaybe<Scalars['Boolean']['input']>;
  includeReferences?: InputMaybe<Scalars['Boolean']['input']>;
};

export type SimilarRulesInput = {
  /** Adjust the weight of AI generated entities in the recommendation algorithm. Default 1.4 */
  entities?: InputMaybe<Scalars['Float']['input']>;
  /** Adjust the weight of content references in the recommendation algorithm. Default 1.2 */
  references?: InputMaybe<Scalars['Float']['input']>;
  /** Adjust the weight of tags in the recommendation algorithm. Default 0.8 */
  tags?: InputMaybe<Scalars['Float']['input']>;
};

export type SoundCloudPost = {
  __typename?: 'SoundCloudPost';
  _id: Scalars['String']['output'];
  url: Scalars['String']['output'];
};

export type SpotifyPlaylist = {
  __typename?: 'SpotifyPlaylist';
  _id: Scalars['String']['output'];
  url: Scalars['String']['output'];
};

/** Static component. */
export type Static = Component & {
  __typename?: 'Static';
  _context?: Maybe<Context>;
  _id: Scalars['String']['output'];
  static_type?: Maybe<StaticComponent>;
  title?: Maybe<Scalars['String']['output']>;
};

/** StaticComponent. */
export enum StaticComponent {
  /** Benefits */
  Benefits = 'BENEFITS',
  /** Explanation */
  Explanation = 'EXPLANATION',
  /** Steps */
  Steps = 'STEPS',
  /** Testimonials */
  Testimonials = 'TESTIMONIALS'
}

export type Text = {
  __typename?: 'Text';
  _id: Scalars['String']['output'];
  body?: Maybe<Scalars['String']['output']>;
  format?: Maybe<TextFormat>;
  html?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

export enum TextFormat {
  Code = 'Code',
  H1 = 'H1',
  H2 = 'H2',
  H3 = 'H3',
  H4 = 'H4',
  H5 = 'H5',
  H6 = 'H6',
  Html = 'HTML'
}

export type ThreadsPost = {
  __typename?: 'ThreadsPost';
  _id: Scalars['String']['output'];
  url: Scalars['String']['output'];
};

export type TikTokPost = {
  __typename?: 'TikTokPost';
  _id: Scalars['String']['output'];
  url: Scalars['String']['output'];
};

export type TwitterPost = {
  __typename?: 'TwitterPost';
  _id: Scalars['String']['output'];
  url: Scalars['String']['output'];
};

/** Embedded Typeform form. */
export type TypeformEmbed = {
  __typename?: 'TypeformEmbed';
  _id: Scalars['String']['output'];
  /** Typeform form ID */
  embed_id: Scalars['String']['output'];
};

export type VimeoPost = {
  __typename?: 'VimeoPost';
  _id: Scalars['String']['output'];
  url: Scalars['String']['output'];
};

export type YouTubePost = {
  __typename?: 'YouTubePost';
  _id: Scalars['String']['output'];
  url: Scalars['String']['output'];
};

/** Event type is specifying the kind of event the customer has with your content. */
export enum _Event {
  Bookmark = 'Bookmark',
  Click = 'Click',
  Clickthrough = 'Clickthrough',
  Comment = 'Comment',
  Impression = 'Impression',
  Like = 'Like',
  Purchase = 'Purchase',
  Share = 'Share',
  Subscribe = 'Subscribe',
  View = 'View',
  Vote = 'Vote'
}

export type _FocalPoint = {
  __typename?: '_FocalPoint';
  x: Scalars['Int']['output'];
  y: Scalars['Int']['output'];
};

export type _Segment = {
  __typename?: '_Segment';
  _id?: Maybe<Scalars['String']['output']>;
  api_id?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
};

/** This union type contains all components and remote sources. */
export type _Prepr_Types = ActiveCampaignEmbed | ApplePodcast | Assets | BlueskyPost | Button | Cta | Cards | CommerceProductsCollection | Contact | Content | Coordinates | FaqQuestion | FacebookPost | Feature | Hero | HubSpotEmbed | InstagramPost | JotformEmbed | NavigationItem | PipedriveEmbed | Quote | Resource | Seo | SoundCloudPost | SpotifyPlaylist | Static | Text | ThreadsPost | TikTokPost | TwitterPost | TypeformEmbed | VimeoPost | YouTubePost;

export type ButtonFragment = { __typename?: 'Button', button_type?: ButtonType | null, text?: string | null, external_url?: string | null, link?:
    | { __typename?: 'Category', _slug?: string | null }
    | { __typename?: 'Page', _slug?: string | null }
    | { __typename?: 'Post', _slug?: string | null }
   | null };

export type FeatureFragment = { __typename?: 'Feature', _id: string, heading?: string | null, sub_heading?: string | null, image_position?: ImagePosition | null, button?: { __typename?: 'Button', button_type?: ButtonType | null, text?: string | null, external_url?: string | null, link?:
      | { __typename?: 'Category', _slug?: string | null }
      | { __typename?: 'Page', _slug?: string | null }
      | { __typename?: 'Post', _slug?: string | null }
     | null } | null, _context?: { __typename?: 'Context', variant_key?: string | null } | null, image?: { __typename?: 'Asset', url?: string | null } | null };

export type HeroFragment = { __typename?: 'Hero', _id: string, sub_heading?: string | null, heading?: string | null, image?: { __typename?: 'Asset', url?: string | null, height?: number | null, width?: number | null } | null, _context?: { __typename?: 'Context', variant_key?: string | null } | null, buttons: Array<{ __typename?: 'Button', button_type?: ButtonType | null, text?: string | null, external_url?: string | null, link?:
      | { __typename?: 'Category', _slug?: string | null }
      | { __typename?: 'Page', _slug?: string | null }
      | { __typename?: 'Post', _slug?: string | null }
     | null }> };

export type GetPageBySlugQueryVariables = Exact<{
  slug?: InputMaybe<Scalars['String']['input']>;
}>;


export type GetPageBySlugQuery = { __typename?: 'Query', Page?: { __typename?: 'Page', title?: string | null, _id: string, content: Array<
      | { __typename: 'CTA' }
      | { __typename: 'Cards' }
      | { __typename: 'Contact' }
      | { __typename: 'Content' }
      | { __typename: 'FAQ' }
      | { __typename: 'Feature', _id: string, heading?: string | null, sub_heading?: string | null, image_position?: ImagePosition | null, button?: { __typename?: 'Button', button_type?: ButtonType | null, text?: string | null, external_url?: string | null, link?:
            | { __typename?: 'Category', _slug?: string | null }
            | { __typename?: 'Page', _slug?: string | null }
            | { __typename?: 'Post', _slug?: string | null }
           | null } | null, _context?: { __typename?: 'Context', variant_key?: string | null } | null, image?: { __typename?: 'Asset', url?: string | null } | null }
      | { __typename: 'Hero', _id: string, sub_heading?: string | null, heading?: string | null, image?: { __typename?: 'Asset', url?: string | null, height?: number | null, width?: number | null } | null, _context?: { __typename?: 'Context', variant_key?: string | null } | null, buttons: Array<{ __typename?: 'Button', button_type?: ButtonType | null, text?: string | null, external_url?: string | null, link?:
            | { __typename?: 'Category', _slug?: string | null }
            | { __typename?: 'Page', _slug?: string | null }
            | { __typename?: 'Post', _slug?: string | null }
           | null }> }
      | { __typename: 'Static' }
    > } | null };

export const ButtonFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Button"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Button"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"button_type"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"external_url"}},{"kind":"Field","name":{"kind":"Name","value":"link"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Category"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_slug"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Page"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_slug"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Post"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_slug"}}]}}]}}]}}]} as unknown as DocumentNode<ButtonFragment, unknown>;
export const FeatureFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Feature"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Feature"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_id"}},{"kind":"Field","name":{"kind":"Name","value":"heading"}},{"kind":"Field","name":{"kind":"Name","value":"sub_heading"}},{"kind":"Field","name":{"kind":"Name","value":"button"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Button"}}]}},{"kind":"Field","name":{"kind":"Name","value":"_context"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"variant_key"}}]}},{"kind":"Field","name":{"kind":"Name","value":"image_position"}},{"kind":"Field","name":{"kind":"Name","value":"image"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"url"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"width"},"value":{"kind":"IntValue","value":"870"}},{"kind":"Argument","name":{"kind":"Name","value":"height"},"value":{"kind":"IntValue","value":"570"}}]}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Button"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Button"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"button_type"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"external_url"}},{"kind":"Field","name":{"kind":"Name","value":"link"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Category"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_slug"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Page"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_slug"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Post"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_slug"}}]}}]}}]}}]} as unknown as DocumentNode<FeatureFragment, unknown>;
export const HeroFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Hero"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Hero"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_id"}},{"kind":"Field","name":{"kind":"Name","value":"sub_heading"}},{"kind":"Field","name":{"kind":"Name","value":"image"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"url"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"preset"},"value":{"kind":"StringValue","value":"Hero","block":false}},{"kind":"Argument","name":{"kind":"Name","value":"width"},"value":{"kind":"IntValue","value":"2000"}}]},{"kind":"Field","name":{"kind":"Name","value":"height"}},{"kind":"Field","name":{"kind":"Name","value":"width"}}]}},{"kind":"Field","name":{"kind":"Name","value":"_context"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"variant_key"}}]}},{"kind":"Field","name":{"kind":"Name","value":"heading"}},{"kind":"Field","name":{"kind":"Name","value":"buttons"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Button"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Button"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Button"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"button_type"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"external_url"}},{"kind":"Field","name":{"kind":"Name","value":"link"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Category"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_slug"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Page"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_slug"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Post"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_slug"}}]}}]}}]}}]} as unknown as DocumentNode<HeroFragment, unknown>;
export const GetPageBySlugDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetPageBySlug"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"slug"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"Page"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"slug"},"value":{"kind":"Variable","name":{"kind":"Name","value":"slug"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"_id"}},{"kind":"Field","name":{"kind":"Name","value":"content"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"__typename"}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Hero"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Hero"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Feature"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Feature"}}]}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Button"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Button"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"button_type"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"external_url"}},{"kind":"Field","name":{"kind":"Name","value":"link"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Category"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_slug"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Page"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_slug"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Post"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_slug"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Hero"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Hero"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_id"}},{"kind":"Field","name":{"kind":"Name","value":"sub_heading"}},{"kind":"Field","name":{"kind":"Name","value":"image"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"url"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"preset"},"value":{"kind":"StringValue","value":"Hero","block":false}},{"kind":"Argument","name":{"kind":"Name","value":"width"},"value":{"kind":"IntValue","value":"2000"}}]},{"kind":"Field","name":{"kind":"Name","value":"height"}},{"kind":"Field","name":{"kind":"Name","value":"width"}}]}},{"kind":"Field","name":{"kind":"Name","value":"_context"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"variant_key"}}]}},{"kind":"Field","name":{"kind":"Name","value":"heading"}},{"kind":"Field","name":{"kind":"Name","value":"buttons"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Button"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Feature"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Feature"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_id"}},{"kind":"Field","name":{"kind":"Name","value":"heading"}},{"kind":"Field","name":{"kind":"Name","value":"sub_heading"}},{"kind":"Field","name":{"kind":"Name","value":"button"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Button"}}]}},{"kind":"Field","name":{"kind":"Name","value":"_context"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"variant_key"}}]}},{"kind":"Field","name":{"kind":"Name","value":"image_position"}},{"kind":"Field","name":{"kind":"Name","value":"image"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"url"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"width"},"value":{"kind":"IntValue","value":"870"}},{"kind":"Argument","name":{"kind":"Name","value":"height"},"value":{"kind":"IntValue","value":"570"}}]}]}}]}}]} as unknown as DocumentNode<GetPageBySlugQuery, GetPageBySlugQueryVariables>;