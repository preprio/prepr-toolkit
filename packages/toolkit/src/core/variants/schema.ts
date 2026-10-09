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
