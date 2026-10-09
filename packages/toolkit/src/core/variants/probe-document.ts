import type {
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
  InlineFragmentNode,
  OperationDefinitionNode,
  SelectionNode,
  SelectionSetNode,
} from 'graphql';

import { collectVariables, documentOf, name, selectionSet } from './ast';

function probeSelectionSet(
  set: SelectionSetNode,
  fragments: Record<string, FragmentDefinitionNode>,
): SelectionSetNode {
  const selections: SelectionNode[] = [
    { kind: 'Field', name: name('__typename') } as unknown as FieldNode,
  ];
  for (const selection of set.selections) {
    if (selection.kind === 'Field') {
      // Leaves never hold variants; only the paths down to lists of items do.
      if (!selection.selectionSet) continue;
      selections.push({
        ...selection,
        selectionSet: probeSelectionSet(selection.selectionSet, fragments),
      });
      continue;
    }
    const fragment =
      selection.kind === 'InlineFragment'
        ? selection
        : fragments[selection.name.value];
    if (!fragment) continue;
    const child = probeSelectionSet(fragment.selectionSet, fragments);
    // A fragment left with only `__typename` adds nothing to the probe.
    if (child.selections.length === 1) continue;
    selections.push({
      kind: 'InlineFragment',
      typeCondition: fragment.typeCondition,
      directives: selection.directives,
      selectionSet: child,
    } as unknown as InlineFragmentNode);
  }
  return selectionSet(selections);
}

/**
 * Your query without its leaf fields: the same items are resolved, so Prepr's
 * `Vary` header still says whether an A/B test is among them, but the
 * response is a fraction of the size. Needs no schema.
 * Returns null for a document without a query operation.
 */
export function toAbProbeDocument(document: unknown): DocumentNode | null {
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

  const probe = probeSelectionSet(operation.selectionSet, fragments);
  const used = new Set<string>();
  collectVariables(probe, used);
  collectVariables(operation.directives, used);

  return {
    kind: 'Document',
    definitions: [
      {
        ...operation,
        name: operation.name && name(`${operation.name.value}AbCheck`),
        variableDefinitions: (operation.variableDefinitions ?? []).filter(
          (definition) => used.has(definition.variable.name.value),
        ),
        selectionSet: probe,
      },
    ],
  } as unknown as DocumentNode;
}
