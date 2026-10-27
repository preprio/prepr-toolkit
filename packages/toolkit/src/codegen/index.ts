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
}

/**
 * Select `_id` on every level of a query that has one, so live preview and
 * click-to-edit can find each item without you selecting it by hand.
 *
 * The schema decides where it goes: only on types that have an `_id`
 * (models and components, not collections like `Pages` or unions; inside a
 * union, on each member). Adding a field never breaks the types Codegen
 * generates. With `typename: true`, `__typename` is added on every object,
 * interface and union below the root too. Fields already selected are left
 * as they are.
 */
export function addPreprIds(
  document: DocumentNode,
  schema: GraphQLSchema,
  options: PreprIdsOptions = {},
): DocumentNode {
  const typename = options.typename ?? false;
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
          !hasResponseKey(node, '_id')
        ) {
          added.push(field('_id'));
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
      return documents.map((file) =>
        file.document
          ? { ...file, document: addPreprIds(file.document, built, options) }
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
 * `createPreprIds({ typename: true })` adds `__typename` as well.
 */
export const preprIds: CodegenDocumentTransform = createPreprIds();
