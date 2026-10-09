import type {
  ArgumentNode,
  DocumentNode,
  FieldNode,
  InlineFragmentNode,
  SelectionNode,
  SelectionSetNode,
  ValueNode,
} from 'graphql';
import { parse } from 'graphql/language/parser.js';

import { PREPR_CONTEXT_ALIAS, PREPR_TYPE_ALIAS } from './constants';
import type { PreprSchemaInfo } from './schema';

export const name = (value: string) => ({ kind: 'Name', value }) as const;

export function selectionSet(selections: SelectionNode[]): SelectionSetNode {
  return { kind: 'SelectionSet', selections } as unknown as SelectionSetNode;
}

// `variant_key` is what the tracking pixel counts impressions by; only the
// variants query needs it.
export function contextField(withKey: boolean): FieldNode {
  const fields = ['kind', 'group_id', 'variant_id'];
  if (withKey) fields.push('variant_key');
  return {
    kind: 'Field',
    alias: name(PREPR_CONTEXT_ALIAS),
    name: name('_context'),
    selectionSet: selectionSet(
      fields.map(
        (field) => ({ kind: 'Field', name: name(field) }) as FieldNode,
      ),
    ),
  } as unknown as FieldNode;
}

export function typenameField(): FieldNode {
  return {
    kind: 'Field',
    alias: name(PREPR_TYPE_ALIAS),
    name: name('__typename'),
  } as unknown as FieldNode;
}

export function inlineFragment(
  typeName: string,
  selections: SelectionNode[],
): InlineFragmentNode {
  return {
    kind: 'InlineFragment',
    typeCondition: { kind: 'NamedType', name: name(typeName) },
    selectionSet: selectionSet(selections),
  } as unknown as InlineFragmentNode;
}

/**
 * `_context` (and the type name) for every item type a personalizable field
 * can return: models and components alike, whatever the schema calls them.
 * With `onlyTypes`, only those members of a union or interface. Decision
 * queries leave the type name and variant key out: only the variants query
 * needs them.
 */
export function contextSelections(
  typeName: string,
  schema: PreprSchemaInfo,
  onlyTypes?: ReadonlySet<string>,
  withType = true,
): SelectionNode[] {
  const fields = () =>
    withType ? [contextField(true), typenameField()] : [contextField(false)];
  const type = schema.types[typeName];
  if (!type) return [];
  if (type.possibleTypes.length > 0) {
    return type.possibleTypes
      .filter(
        (member) =>
          schema.types[member]?.hasContext &&
          (!onlyTypes || onlyTypes.has(member)),
      )
      .map((member) => inlineFragment(member, fields()));
  }
  return type.hasContext ? fields() : [];
}

export function withoutPersonalizeArg(args: readonly ArgumentNode[] = []) {
  return args.filter((arg) => arg.name.value !== 'personalize');
}

export function documentOf(document: unknown): DocumentNode {
  if (typeof document === 'string') return parse(document);
  if (document instanceof String) return parse(document.toString());
  return document as DocumentNode;
}

export function collectVariables(node: unknown, used: Set<string>): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectVariables(item, used);
    return;
  }
  const value = node as ValueNode & Record<string, unknown>;
  if (value.kind === 'Variable') {
    used.add(value.name.value);
    return;
  }
  for (const key of Object.keys(value)) {
    if (key !== 'loc') collectVariables(value[key], used);
  }
}
