import type {
  ArgumentNode,
  DocumentNode,
  SelectionNode,
  SelectionSetNode,
} from 'graphql';

import {
  contextSelections,
  documentOf,
  name,
  selectionSet,
  withoutPersonalizeArg,
} from './ast';
import type { PreprSchemaInfo } from './schema';

function variantsSelectionSet(
  set: SelectionSetNode,
  typeName: string,
  schema: PreprSchemaInfo,
): SelectionSetNode {
  const selections = set.selections.map((selection): SelectionNode => {
    if (selection.kind === 'InlineFragment') {
      return {
        ...selection,
        selectionSet: variantsSelectionSet(
          selection.selectionSet,
          selection.typeCondition?.name.value ?? typeName,
          schema,
        ),
      };
    }
    if (selection.kind !== 'Field' || !selection.selectionSet) return selection;

    const field = schema.types[typeName]?.fields[selection.name.value];
    if (!field) return selection;
    const child = variantsSelectionSet(
      selection.selectionSet,
      field.type,
      schema,
    );
    if (!field.personalizable) return { ...selection, selectionSet: child };

    return {
      ...selection,
      arguments: [
        ...withoutPersonalizeArg(selection.arguments),
        {
          kind: 'Argument',
          name: name('personalize'),
          value: { kind: 'BooleanValue', value: false },
        } as unknown as ArgumentNode,
      ],
      selectionSet: selectionSet([
        ...child.selections,
        ...contextSelections(field.type, schema),
      ]),
    };
  });
  return { ...set, selections };
}

/**
 * Your query, asking for every variant: `personalize: false` on every
 * personalizable field, with each item's `_context` selected under
 * {@link PREPR_CONTEXT_ALIAS}. The result is the same for every visitor.
 */
export function toVariantsDocument(
  document: unknown,
  schema: PreprSchemaInfo,
): DocumentNode {
  const doc = documentOf(document);
  return {
    ...doc,
    definitions: doc.definitions.map((definition) => {
      if (definition.kind === 'OperationDefinition') {
        return {
          ...definition,
          selectionSet: variantsSelectionSet(
            definition.selectionSet,
            schema.queryType,
            schema,
          ),
        };
      }
      if (definition.kind === 'FragmentDefinition') {
        return {
          ...definition,
          selectionSet: variantsSelectionSet(
            definition.selectionSet,
            definition.typeCondition.name.value,
            schema,
          ),
        };
      }
      return definition;
    }),
  };
}
