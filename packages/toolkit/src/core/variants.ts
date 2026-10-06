import type {
  ArgumentNode,
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
  InlineFragmentNode,
  OperationDefinitionNode,
  SelectionNode,
  SelectionSetNode,
  ValueNode,
} from 'graphql';
import { parse } from 'graphql/language/parser.js';

/**
 * Alias under which the toolkit selects `_context { kind group_id variant_id }`
 * on personalizable items. An alias keeps it apart from any `_context`
 * selection of your own (such as `variant_key` for impression tracking).
 */
export const PREPR_CONTEXT_ALIAS = '_preprContext';

/** Prepr's variant id for visitors outside every targeted segment. */
export const PREPR_DEFAULT_VARIANT = 'ALL_OTHER_USERS';

/** The variant ids Prepr chose for one visitor, per personalization group. */
export type PreprDecisions = ReadonlyMap<string, readonly string[]>;

interface FieldInfo {
  /** Named type of the field, without list/non-null wrappers. */
  type: string;
  /** The field accepts Prepr's `personalize` argument (a stack). */
  personalizable: boolean;
}

interface TypeInfo {
  fields: Record<string, FieldInfo>;
  /** Members of a union or implementations of an interface. */
  possibleTypes: string[];
  hasContext: boolean;
}

/** The slice of the schema the variant transforms need. */
export interface PreprSchemaInfo {
  queryType: string;
  types: Record<string, TypeInfo>;
}

/** Introspection query for {@link toSchemaInfo}; fetched once per client. */
export const PREPR_SCHEMA_QUERY = `query PreprPersonalizationSchema {
  __schema {
    queryType { name }
    types {
      name
      possibleTypes { name }
      fields {
        name
        args { name }
        type { name ofType { name ofType { name ofType { name ofType { name } } } } }
      }
    }
  }
}`;

interface IntrospectedType {
  name: string;
  possibleTypes?: { name: string }[] | null;
  fields?:
    | { name: string; args: { name: string }[]; type: IntrospectedTypeRef }[]
    | null;
}
interface IntrospectedTypeRef {
  name?: string | null;
  ofType?: IntrospectedTypeRef | null;
}

function namedType(ref: IntrospectedTypeRef): string {
  let current: IntrospectedTypeRef | null | undefined = ref;
  while (current && !current.name) current = current.ofType;
  return current?.name ?? '';
}

/** Reduces the result of {@link PREPR_SCHEMA_QUERY} to what the transforms use. */
export function toSchemaInfo(introspection: {
  __schema: { queryType: { name: string }; types: IntrospectedType[] };
}): PreprSchemaInfo {
  const types: Record<string, TypeInfo> = {};
  for (const type of introspection.__schema.types) {
    if (type.name.startsWith('__')) continue;
    const fields: Record<string, FieldInfo> = {};
    for (const field of type.fields ?? []) {
      fields[field.name] = {
        type: namedType(field.type),
        personalizable: field.args.some((arg) => arg.name === 'personalize'),
      };
    }
    types[type.name] = {
      fields,
      possibleTypes: (type.possibleTypes ?? []).map((t) => t.name),
      hasContext: '_context' in fields,
    };
  }
  return { queryType: introspection.__schema.queryType.name, types };
}

// --- AST helpers ------------------------------------------------------------

const name = (value: string) => ({ kind: 'Name', value }) as const;

function selectionSet(selections: SelectionNode[]): SelectionSetNode {
  return { kind: 'SelectionSet', selections } as unknown as SelectionSetNode;
}

function contextField(): FieldNode {
  return {
    kind: 'Field',
    alias: name(PREPR_CONTEXT_ALIAS),
    name: name('_context'),
    selectionSet: selectionSet(
      ['kind', 'group_id', 'variant_id'].map(
        (field) => ({ kind: 'Field', name: name(field) }) as FieldNode,
      ),
    ),
  } as unknown as FieldNode;
}

function inlineFragment(
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
 * `_context` for every item type a personalizable field can return: models
 * and components alike, whatever the schema calls them.
 */
function contextSelections(
  typeName: string,
  schema: PreprSchemaInfo,
): SelectionNode[] {
  const type = schema.types[typeName];
  if (!type) return [];
  if (type.possibleTypes.length > 0) {
    return type.possibleTypes
      .filter((member) => schema.types[member]?.hasContext)
      .map((member) => inlineFragment(member, [contextField()]));
  }
  return type.hasContext ? [contextField()] : [];
}

function withoutPersonalizeArg(args: readonly ArgumentNode[] = []) {
  return args.filter((arg) => arg.name.value !== 'personalize');
}

function documentOf(document: unknown): DocumentNode {
  if (typeof document === 'string') return parse(document);
  if (document instanceof String) return parse(document.toString());
  return document as DocumentNode;
}

// --- Variants document --------------------------------------------------------

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

// --- Decision document ----------------------------------------------------------

function decisionSelectionSet(
  set: SelectionSetNode,
  typeName: string,
  schema: PreprSchemaInfo,
  fragments: Record<string, FragmentDefinitionNode>,
): SelectionSetNode | null {
  const selections: SelectionNode[] = [];
  for (const selection of set.selections) {
    if (selection.kind === 'FragmentSpread') {
      const fragment = fragments[selection.name.value];
      if (!fragment) continue;
      const pruned = decisionSelectionSet(
        fragment.selectionSet,
        fragment.typeCondition.name.value,
        schema,
        fragments,
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
        schema,
        fragments,
      );
      if (pruned) selections.push({ ...selection, selectionSet: pruned });
      continue;
    }
    if (!selection.selectionSet) continue;

    const field = schema.types[typeName]?.fields[selection.name.value];
    if (!field) continue;
    const child = decisionSelectionSet(
      selection.selectionSet,
      field.type,
      schema,
      fragments,
    );
    if (field.personalizable) {
      selections.push({
        ...selection,
        arguments: withoutPersonalizeArg(selection.arguments),
        selectionSet: selectionSet([
          ...(child?.selections ?? []),
          ...contextSelections(field.type, schema),
        ]),
      });
    } else if (child) {
      selections.push({ ...selection, selectionSet: child });
    }
  }
  return selections.length > 0 ? selectionSet(selections) : null;
}

function collectVariables(node: unknown, used: Set<string>): void {
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

/**
 * The smallest query that tells which variant a visitor gets: your query cut
 * down to the paths that lead to personalizable fields, selecting only each
 * item's `_context`. Returns null when the query has nothing personalizable.
 */
export function toDecisionDocument(
  document: unknown,
  schema: PreprSchemaInfo,
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

  const pruned = decisionSelectionSet(
    operation.selectionSet,
    schema.queryType,
    schema,
    fragments,
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

// --- Resolving variants ---------------------------------------------------------

interface ItemContext {
  kind?: string | null;
  group_id?: string | null;
  variant_id?: string | null;
}

function contextOf(item: unknown): ItemContext | null {
  if (!item || typeof item !== 'object') return null;
  const context = (item as Record<string, unknown>)[PREPR_CONTEXT_ALIAS];
  const ctx = context as ItemContext | null | undefined;
  return ctx?.kind && ctx.group_id ? ctx : null;
}

/**
 * Variant ids per group from a decision response, de-duplicated and in
 * Prepr's order. A visitor in several segments can get more than one variant
 * of the same group, so each entry is a list.
 */
export function decisionsFrom(data: unknown): PreprDecisions {
  const decisions = new Map<string, string[]>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== 'object') return;
    const ctx = contextOf(value);
    if (ctx?.group_id && ctx.variant_id) {
      const ids = decisions.get(ctx.group_id) ?? [];
      if (!ids.includes(ctx.variant_id)) ids.push(ctx.variant_id);
      decisions.set(ctx.group_id, ids);
    }
    Object.values(value).forEach(walk);
  };
  walk(data);
  return decisions;
}

export interface ResolveVariantsOptions {
  /**
   * The visitor's per-group variants (from a decision query). Without it,
   * personalization groups show their default variant.
   */
  decisions?: PreprDecisions;
  /** The visitor's A/B bucket. Without it, A/B groups use the decision, then `A`. */
  bucket?: string;
}

function chosenVariants(
  ctx: ItemContext,
  options: ResolveVariantsOptions,
): readonly string[] {
  const decided = options.decisions?.get(ctx.group_id!);
  if (ctx.kind === 'AB_TEST') {
    return options.bucket ? [options.bucket] : (decided ?? ['A']);
  }
  return decided ?? [PREPR_DEFAULT_VARIANT];
}

/**
 * Keeps, in every list of a variants query result, only the variants this
 * visitor gets, at any depth (page stacks, nested stacks, personalized
 * buttons). Items outside a group are kept as they are.
 */
export function resolveVariants<T>(
  data: T,
  options: ResolveVariantsOptions = {},
): T {
  const resolve = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value
        .filter((item) => {
          const ctx = contextOf(item);
          return (
            !ctx || chosenVariants(ctx, options).includes(ctx.variant_id ?? '')
          );
        })
        .map(resolve);
    }
    if (!value || typeof value !== 'object') return value;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) out[key] = resolve(child);
    return out;
  };
  return resolve(data) as T;
}

function containsKind(value: unknown, kind: string): boolean {
  if (Array.isArray(value))
    return value.some((item) => containsKind(item, kind));
  if (!value || typeof value !== 'object') return false;
  if (contextOf(value)?.kind === kind) return true;
  return Object.values(value).some((child) => containsKind(child, kind));
}

/** A run of stack items that renders the same way: see {@link splitStack}. */
export interface PreprStackBlock<T> {
  key: string;
  items: T[];
  /**
   * Some item in the block (or nested inside one) is a segment variant, so
   * the block depends on the visitor and is decided per request.
   */
  personalized: boolean;
  /**
   * Some item in the block (or nested inside one) is an A/B variant. Without
   * a known bucket, such a block renders once per bucket and the visitor's
   * bucket is picked in the browser before first paint.
   */
  abTest: boolean;
}

/**
 * Splits a variants-query stack into blocks. Each personalization or A/B
 * group becomes one block (a variant can hold a different number of items
 * than the default); consecutive items that never vary are merged.
 */
export function splitStack<T>(items: readonly T[]): PreprStackBlock<T>[] {
  const blocks: PreprStackBlock<T>[] = [];
  items.forEach((item, index) => {
    const ctx = contextOf(item);
    const groupKey = ctx ? `group:${ctx.group_id}` : null;
    const personalized = containsKind(item, 'PERSONALIZATION');
    const abTest = containsKind(item, 'AB_TEST');
    const last = blocks.at(-1);
    const plain = !groupKey && !personalized && !abTest;
    if (groupKey && last?.key === groupKey) {
      last.personalized ||= personalized;
      last.abTest ||= abTest;
      last.items.push(item);
    } else if (plain && last && !last.personalized && !last.abTest) {
      last.items.push(item);
    } else {
      blocks.push({
        key: groupKey ?? `items:${index}`,
        items: [item],
        personalized,
        abTest,
      });
    }
  });
  return blocks;
}
