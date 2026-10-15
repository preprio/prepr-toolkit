import type {
  DocumentNode,
  FragmentDefinitionNode,
  OperationDefinitionNode,
  SelectionNode,
  SelectionSetNode,
} from 'graphql';

import {
  collectVariables,
  contextSelections,
  documentOf,
  inlineFragment,
  name,
  selectionSet,
  withoutPersonalizeArg,
} from './ast';
import { PREPR_CONTEXT_ALIAS } from './constants';
import type { PreprGroupPaths } from './resolve';
import type { PreprSchemaInfo } from './schema';

interface DecisionContext {
  schema: PreprSchemaInfo;
  fragments: Record<string, FragmentDefinitionNode>;
  /** Ask only about the first personalizable list on each path, not the ones nested in its items. */
  topLevelOnly?: boolean;
  /**
   * When known: the response paths whose lists hold personalization groups
   * (with the item types that do), and every prefix of those paths. Fields
   * and types elsewhere are left out.
   */
  paths?: {
    groups: PreprGroupPaths;
    prefixes: ReadonlySet<string>;
  };
}

function decisionSelectionSet(
  set: SelectionSetNode,
  typeName: string,
  path: string,
  ctx: DecisionContext,
): SelectionSetNode | null {
  const selections: SelectionNode[] = [];
  for (const selection of set.selections) {
    if (selection.kind === 'FragmentSpread') {
      const fragment = ctx.fragments[selection.name.value];
      if (!fragment) continue;
      const pruned = decisionSelectionSet(
        fragment.selectionSet,
        fragment.typeCondition.name.value,
        path,
        ctx,
      );
      if (!pruned) continue;
      // On the type it is already in, a fragment only repeats the condition:
      // its selections go in as they are, which keeps the query short.
      if (fragment.typeCondition.name.value === typeName) {
        selections.push(...pruned.selections);
      } else {
        selections.push(
          inlineFragment(fragment.typeCondition.name.value, [
            ...pruned.selections,
          ]),
        );
      }
      continue;
    }
    if (selection.kind === 'InlineFragment') {
      const condition = selection.typeCondition?.name.value ?? typeName;
      const pruned = decisionSelectionSet(
        selection.selectionSet,
        condition,
        path,
        ctx,
      );
      if (!pruned) continue;
      if (condition === typeName && !selection.directives?.length) {
        selections.push(...pruned.selections);
      } else {
        selections.push({ ...selection, selectionSet: pruned });
      }
      continue;
    }
    if (!selection.selectionSet) continue;

    const field = ctx.schema.types[typeName]?.fields[selection.name.value];
    if (!field) continue;
    // Response paths use the alias when there is one.
    const key = selection.alias?.value ?? selection.name.value;
    const fieldPath = path ? `${path}.${key}` : key;
    if (ctx.paths && !ctx.paths.prefixes.has(fieldPath)) continue;

    const child = decisionSelectionSet(
      selection.selectionSet,
      field.type,
      fieldPath,
      ctx,
    );
    const groupTypes = ctx.paths?.groups.get(fieldPath);
    const holdsGroups =
      field.personalizable && (!ctx.paths || groupTypes !== undefined);
    if (holdsGroups) {
      selections.push({
        ...selection,
        arguments: withoutPersonalizeArg(selection.arguments),
        selectionSet: selectionSet([
          ...(ctx.topLevelOnly ? [] : (child?.selections ?? [])),
          ...contextSelections(
            field.type,
            ctx.schema,
            groupTypes && !groupTypes.has('*') ? groupTypes : undefined,
            false,
          ),
        ]),
      });
    } else if (child) {
      selections.push({
        ...selection,
        arguments: field.personalizable
          ? withoutPersonalizeArg(selection.arguments)
          : selection.arguments,
        selectionSet: child,
      });
    }
  }
  return selections.length > 0 ? selectionSet(selections) : null;
}

/**
 * The smallest query that tells which variant a visitor gets: your query cut
 * down to the paths that lead to personalizable fields, selecting only each
 * item's `_context`. With `groupPaths` (from {@link personalizationPaths}),
 * only the fields, and the item types, that actually hold personalization
 * groups are kept. With `topLevelOnly`, lists nested inside the items of a
 * personalizable list are left out.
 * Returns null when nothing is left to ask.
 */
export function toDecisionDocument(
  document: unknown,
  schema: PreprSchemaInfo,
  groupPaths?: PreprGroupPaths,
  options?: { topLevelOnly?: boolean },
): DocumentNode | null {
  const doc = documentOf(document);
  const fragments: Record<string, FragmentDefinitionNode> = {};
  for (const definition of doc.definitions) {
    if (definition.kind === 'FragmentDefinition') {
      fragments[definition.name.value] = definition;
    }
  }
  const operation = doc.definitions.find(
    (definition): definition is OperationDefinitionNode =>
      definition.kind === 'OperationDefinition',
  );
  if (!operation) return null;

  let paths: DecisionContext['paths'];
  if (groupPaths) {
    const prefixes = new Set<string>();
    for (const groupPath of groupPaths.keys()) {
      const parts = groupPath.split('.');
      for (let i = 1; i <= parts.length; i++) {
        prefixes.add(parts.slice(0, i).join('.'));
      }
    }
    paths = { groups: groupPaths, prefixes };
  }
  const pruned = decisionSelectionSet(
    operation.selectionSet,
    schema.queryType,
    '',
    { schema, fragments, paths, topLevelOnly: options?.topLevelOnly },
  );
  if (!pruned) return null;

  const used = new Set<string>();
  collectVariables(pruned, used);
  collectVariables(operation.directives, used);
  const shared = sharedContextFragment(schema);

  return {
    kind: 'Document',
    definitions: [
      ...(shared ? [shared.definition] : []),
      {
        ...operation,
        name: operation.name && name(`${operation.name.value}Decision`),
        variableDefinitions: (operation.variableDefinitions ?? []).filter(
          (definition) => used.has(definition.variable.name.value),
        ),
        selectionSet: shared ? shared.apply(pruned) : pruned,
      },
    ],
  } as unknown as DocumentNode;
}

/**
 * One named fragment for the `_context` fields every item selects, when all
 * item types share one context type: a page query can select `_context` on
 * hundreds of types, and the decision query is sent in full on every page
 * view.
 */
function sharedContextFragment(schema: PreprSchemaInfo): {
  definition: FragmentDefinitionNode;
  apply: (set: SelectionSetNode) => SelectionSetNode;
} | null {
  const contextTypes = new Set(
    Object.values(schema.types).flatMap((type) =>
      type.hasContext ? [type.fields._context!.type] : [],
    ),
  );
  if (contextTypes.size !== 1) return null;
  const [contextType] = contextTypes;
  const fragmentName = 'PreprDecisionContext';
  const definition = {
    kind: 'FragmentDefinition',
    name: name(fragmentName),
    typeCondition: { kind: 'NamedType', name: name(contextType!) },
    selectionSet: selectionSet(
      ['kind', 'group_id', 'variant_id'].map(
        (field) => ({ kind: 'Field', name: name(field) }) as SelectionNode,
      ),
    ),
  } as unknown as FragmentDefinitionNode;
  const spread = {
    kind: 'FragmentSpread',
    name: name(fragmentName),
  } as unknown as SelectionNode;
  const apply = (set: SelectionSetNode): SelectionSetNode =>
    selectionSet(
      set.selections.map((selection) => {
        if (
          selection.kind === 'Field' &&
          selection.alias?.value === PREPR_CONTEXT_ALIAS
        ) {
          return { ...selection, selectionSet: selectionSet([spread]) };
        }
        return 'selectionSet' in selection && selection.selectionSet
          ? ({
              ...selection,
              selectionSet: apply(selection.selectionSet),
            } as SelectionNode)
          : selection;
      }),
    );
  return { definition, apply };
}
