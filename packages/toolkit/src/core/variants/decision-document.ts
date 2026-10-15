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
import type { PreprGroupPaths } from './resolve';
import type { PreprSchemaInfo } from './schema';

interface DecisionContext {
  schema: PreprSchemaInfo;
  fragments: Record<string, FragmentDefinitionNode>;
  /** Ask only about the first personalizable list on each path, not the ones nested in its items. */
  topLevelOnly?: boolean;
  /** The opposite: only the lists nested in the items of the first one. */
  nestedOnly?: boolean;
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
  // Whether a personalizable list encloses this selection.
  nested = false,
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
        nested,
      );
      if (pruned) {
        selections.push(
          inlineFragment(fragment.typeCondition.name.value, [
            ...pruned.selections,
          ]),
        );
      }
      continue;
    }
    if (selection.kind === 'InlineFragment') {
      const pruned = decisionSelectionSet(
        selection.selectionSet,
        selection.typeCondition?.name.value ?? typeName,
        path,
        ctx,
        nested,
      );
      if (pruned) selections.push({ ...selection, selectionSet: pruned });
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
      nested || field.personalizable,
    );
    const groupTypes = ctx.paths?.groups.get(fieldPath);
    const holdsGroups =
      field.personalizable && (!ctx.paths || groupTypes !== undefined);
    if (holdsGroups && ctx.nestedOnly && !nested) {
      // Decided elsewhere: keep only the way to the lists inside its items.
      if (child) {
        selections.push({
          ...selection,
          arguments: withoutPersonalizeArg(selection.arguments),
          selectionSet: child,
        });
      }
    } else if (holdsGroups) {
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
 * personalizable list are left out; with `nestedOnly`, only those are kept.
 * Returns null when nothing is left to ask.
 */
export function toDecisionDocument(
  document: unknown,
  schema: PreprSchemaInfo,
  groupPaths?: PreprGroupPaths,
  options?: { topLevelOnly?: boolean; nestedOnly?: boolean },
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
    {
      schema,
      fragments,
      paths,
      topLevelOnly: options?.topLevelOnly,
      nestedOnly: options?.nestedOnly,
    },
  );
  if (!pruned) return null;

  const used = new Set<string>();
  collectVariables(pruned, used);
  collectVariables(operation.directives, used);

  return {
    kind: 'Document',
    definitions: [
      {
        ...operation,
        name: operation.name && name(`${operation.name.value}Decision`),
        variableDefinitions: (operation.variableDefinitions ?? []).filter(
          (definition) => used.has(definition.variable.name.value),
        ),
        selectionSet: pruned,
      },
    ],
  } as unknown as DocumentNode;
}
