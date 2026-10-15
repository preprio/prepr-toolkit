import {
  visit,
  type DocumentNode,
  type NameNode,
  type OperationDefinitionNode,
  type SelectionNode,
} from 'graphql';

import { name } from './ast';

/** One operation per query in a batch, and how to split the answer back up. */
export interface PreprBatch {
  document: DocumentNode;
  variables: Record<string, unknown>;
  /** The part of a batch response that answers query `index`. */
  split(data: unknown, index: number): Record<string, unknown>;
}

const prefix = (index: number) => `p${index}_`;

// Root fields carry the prefix as an alias, also inside root inline fragments.
function aliasRoot(
  selections: readonly SelectionNode[],
  index: number,
): SelectionNode[] {
  return selections.map((selection) => {
    if (selection.kind === 'Field') {
      const key = (selection.alias ?? selection.name).value;
      return {
        ...selection,
        alias: name(prefix(index) + key) as unknown as NameNode,
      };
    }
    if (selection.kind === 'InlineFragment') {
      return {
        ...selection,
        selectionSet: {
          ...selection.selectionSet,
          selections: aliasRoot(selection.selectionSet.selections, index),
        },
      };
    }
    return selection;
  });
}

/**
 * Merges single-operation queries (decision documents, which hold no
 * fragment definitions) into one operation, so deciding several pages costs
 * one request. Each query's root fields and variables get a `p<index>_`
 * prefix, so two pages of the same query with different variables never
 * clash.
 */
export function batchDocuments(
  queries: readonly {
    document: DocumentNode;
    variables?: Record<string, unknown>;
  }[],
): PreprBatch {
  const variableDefinitions: unknown[] = [];
  const selections: SelectionNode[] = [];
  const variables: Record<string, unknown> = {};

  queries.forEach(({ document, variables: values = {} }, index) => {
    const operation = document.definitions.find(
      (definition): definition is OperationDefinitionNode =>
        definition.kind === 'OperationDefinition',
    );
    if (!operation) return;
    const renamed = visit(operation, {
      Variable: (node) => ({
        ...node,
        name: name(prefix(index) + node.name.value) as unknown as NameNode,
      }),
    });
    for (const definition of renamed.variableDefinitions ?? []) {
      const original = definition.variable.name.value.slice(
        prefix(index).length,
      );
      variableDefinitions.push(definition);
      if (original in values) {
        variables[definition.variable.name.value] = values[original];
      }
    }
    selections.push(...aliasRoot(renamed.selectionSet.selections, index));
  });

  return {
    document: {
      kind: 'Document',
      definitions: [
        {
          kind: 'OperationDefinition',
          operation: 'query',
          name: name('PreprBatchDecision'),
          variableDefinitions,
          selectionSet: { kind: 'SelectionSet', selections },
        },
      ],
    } as unknown as DocumentNode,
    variables,
    split(data, index) {
      const out: Record<string, unknown> = {};
      if (typeof data !== 'object' || data === null) return out;
      const start = prefix(index);
      for (const [key, value] of Object.entries(data)) {
        if (key.startsWith(start)) out[key.slice(start.length)] = value;
      }
      return out;
    },
  };
}
