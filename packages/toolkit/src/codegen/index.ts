import {
  buildASTSchema,
  isCompositeType,
  isInterfaceType,
  isObjectType,
  Kind,
  TypeInfo,
  visit,
  visitWithTypeInfo,
  type DocumentNode,
  type FieldNode,
  type GraphQLInterfaceType,
  type GraphQLObjectType,
  type GraphQLSchema,
  type SelectionSetNode,
} from 'graphql';

/**
 * The slice of a GraphQL Codegen `DocumentFile` this transform touches,
 * written out so the package needs no dependency on `@graphql-codegen/*`.
 */
export interface CodegenDocumentFile {
  document?: DocumentNode;
}

function field(name: string): FieldNode {
  return { kind: Kind.FIELD, name: { kind: Kind.NAME, value: name } };
}

/**
 * `name @include(if: true)`: always returned by the API, but typed as
 * optional by Codegen, which treats every `@include` field that way.
 */
function optionalField(name: string): FieldNode {
  return {
    ...field(name),
    directives: [
      {
        kind: Kind.DIRECTIVE,
        name: { kind: Kind.NAME, value: 'include' },
        arguments: [
          {
            kind: Kind.ARGUMENT,
            name: { kind: Kind.NAME, value: 'if' },
            value: { kind: Kind.BOOLEAN, value: true },
          },
        ],
      },
    ],
  };
}

/** Fragment name → the type it is defined on. */
type FragmentTypes = ReadonlyMap<string, string>;

function collectFragmentTypes(
  documents: Iterable<DocumentNode>,
): Map<string, string> {
  const types = new Map<string, string>();
  for (const document of documents) {
    for (const definition of document.definitions) {
      if (definition.kind === Kind.FRAGMENT_DEFINITION) {
        types.set(definition.name.value, definition.typeCondition.name.value);
      }
    }
  }
  return types;
}

/**
 * Whether a fragment spread in the set already brings `_id` for `type`: the
 * fragment is defined on `type` itself, or on an interface it implements,
 * and that type has an `_id`, so the fragment selects it. A spread behind
 * `@include` or `@skip` does not count, since it can be left out.
 */
function spreadCarriesId(
  set: SelectionSetNode,
  type: GraphQLObjectType | GraphQLInterfaceType,
  schema: GraphQLSchema,
  fragments: FragmentTypes,
): boolean {
  return set.selections.some((s) => {
    if (s.kind !== Kind.FRAGMENT_SPREAD || s.directives?.length) return false;
    const name = fragments.get(s.name.value);
    const on = name ? schema.getType(name) : undefined;
    if (!on || !(isObjectType(on) || isInterfaceType(on))) return false;
    if (!('_id' in on.getFields())) return false;
    return (
      on.name === type.name ||
      (isInterfaceType(on) && schema.isSubType(on, type))
    );
  });
}

/** Whether the set already has a field answering under `key`. */
function hasResponseKey(set: SelectionSetNode, key: string): boolean {
  return set.selections.some(
    (s) => s.kind === Kind.FIELD && (s.alias ?? s.name).value === key,
  );
}

export interface PreprIdsOptions {
  /**
   * Also select `__typename` on every object, interface and union below the
   * root. Default `false`: a selected `__typename` changes the types Codegen
   * generates (each union member is typed separately, and objects built by
   * hand must carry one), which can break code that compiles today. Live
   * preview only needs it on dynamic content entries, where you select it
   * already to render them.
   */
  typename?: boolean;
  /**
   * Type the added `_id` as optional (`_id?: string`), so objects written by
   * hand against the generated types, such as test fixtures and mocks, keep
   * compiling without one. Default `false`.
   *
   * The field is selected as `_id @include(if: true)`: the API always
   * returns it, and Codegen types a field with `@include` as optional. Code
   * that reads an added `_id` gets `string | undefined`. An `_id` you select
   * yourself is left as written.
   */
  optionalInTypes?: boolean;
}

/**
 * Select `_id` on every level of a query that has one, so live preview and
 * click-to-edit can find each item without you selecting it by hand.
 *
 * The schema decides where it goes: only on types that have an `_id`
 * (models and components, not collections like `Pages` or unions; inside a
 * union, on each member). Code that reads the data keeps compiling; objects
 * written by hand against the generated types need an `_id` too, unless
 * `optionalInTypes` is set. With `typename: true`, `__typename` is added on every object,
 * interface and union below the root too. Fields already selected are left
 * as they are.
 *
 * A level that spreads a fragment on its own type gets no `_id` of its own:
 * the fragment selects it, and a second one next to the spread would sit
 * outside the fragment's masked type. Fragments are looked up in `document`.
 */
export function addPreprIds(
  document: DocumentNode,
  schema: GraphQLSchema,
  options: PreprIdsOptions = {},
): DocumentNode {
  return addIds(document, schema, options, collectFragmentTypes([document]));
}

function addIds(
  document: DocumentNode,
  schema: GraphQLSchema,
  options: PreprIdsOptions,
  fragments: FragmentTypes,
): DocumentNode {
  const typename = options.typename ?? false;
  const idField = options.optionalInTypes ? optionalField('_id') : field('_id');
  const roots = new Set<unknown>(
    [
      schema.getQueryType(),
      schema.getMutationType(),
      schema.getSubscriptionType(),
    ].filter(Boolean),
  );
  const typeInfo = new TypeInfo(schema);

  return visit(
    document,
    visitWithTypeInfo(typeInfo, {
      SelectionSet(node) {
        const type = typeInfo.getParentType();
        if (!type || !isCompositeType(type) || roots.has(type)) return;

        const added: FieldNode[] = [];
        if (
          (isObjectType(type) || isInterfaceType(type)) &&
          '_id' in type.getFields() &&
          !hasResponseKey(node, '_id') &&
          !spreadCarriesId(node, type, schema, fragments)
        ) {
          added.push(idField);
        }
        if (typename && !hasResponseKey(node, '__typename')) {
          added.push(field('__typename'));
        }
        if (!added.length) return;
        return { ...node, selections: [...added, ...node.selections] };
      },
    }),
  );
}

/** A GraphQL Codegen document transform. */
export interface CodegenDocumentTransform {
  transform<File extends CodegenDocumentFile>(options: {
    documents: File[];
    schema: DocumentNode;
  }): File[];
}

/**
 * GraphQL Codegen document transform that runs `addPreprIds` on every
 * document, with options:
 *
 * ```ts
 * documentTransforms: [createPreprIds({ typename: true })],
 * ```
 */
export function createPreprIds(
  options: PreprIdsOptions = {},
): CodegenDocumentTransform {
  return {
    transform({ documents, schema }) {
      const built = buildASTSchema(schema, { assumeValidSDL: true });
      // Fragments usually live in another file than the query spreading them.
      const fragments = collectFragmentTypes(
        documents.flatMap((file) => (file.document ? [file.document] : [])),
      );
      return documents.map((file) =>
        file.document
          ? {
              ...file,
              document: addIds(file.document, built, options, fragments),
            }
          : file,
      );
    },
  };
}

/**
 * GraphQL Codegen document transform that runs `addPreprIds` on every
 * document, so the generated documents and types include `_id` wherever the
 * schema has one:
 *
 * ```ts
 * // codegen.ts
 * import { preprIds } from '@preprio/toolkit/codegen';
 *
 * generates: {
 *   'src/gql/': {
 *     preset: 'client',
 *     documentTransforms: [preprIds],
 *   },
 * },
 * ```
 *
 * `createPreprIds({ typename: true })` adds `__typename` as well, and
 * `createPreprIds({ optionalInTypes: true })` types the added `_id` as optional.
 */
export const preprIds: CodegenDocumentTransform = createPreprIds();
