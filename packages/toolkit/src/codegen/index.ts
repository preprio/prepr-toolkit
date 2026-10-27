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
  [key: string]: unknown;
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

/**
 * Select `_id` and `__typename` on every level of a query that has them, so
 * live preview and click-to-edit can find each item without you selecting
 * them by hand.
 *
 * The schema decides where they go: `_id` only on types that have one
 * (models and components, not collections like `Pages` or unions), and
 * `__typename` on every object, interface and union below the root.
 * Fields already selected are left as they are.
 */
export function addPreprIds(
  document: DocumentNode,
  schema: GraphQLSchema,
): DocumentNode {
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
        if (!hasResponseKey(node, '__typename')) {
          added.push(field('__typename'));
        }
        if (!added.length) return;
        return { ...node, selections: [...added, ...node.selections] };
      },
    }),
  );
}

/**
 * GraphQL Codegen document transform that runs `addPreprIds` on every
 * document, so the generated documents and types include `_id` and
 * `__typename` wherever the schema has them:
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
 */
export const preprIds = {
  transform({
    documents,
    schema,
  }: {
    documents: CodegenDocumentFile[];
    schema: DocumentNode;
  }): CodegenDocumentFile[] {
    const built = buildASTSchema(schema, { assumeValidSDL: true });
    return documents.map((file) =>
      file.document
        ? { ...file, document: addPreprIds(file.document, built) }
        : file,
    );
  },
};
