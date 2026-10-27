// @vitest-environment node
// Runs annotateEditLinks over generated Prepr-like results (edit links on
// every text, as Prepr's API returns them in edit mode) for queries over a
// Prepr-shaped schema, with and without `addPreprIds`, and checks what must
// hold for any schema.
import { vercelStegaCombine, vercelStegaSplit } from '@vercel/stega';
import {
  buildSchema,
  getNamedType,
  isAbstractType,
  isListType,
  isNonNullType,
  isObjectType,
  isInterfaceType,
  isUnionType,
  Kind,
  parse,
  print,
  type DocumentNode,
  type FragmentDefinitionNode,
  type GraphQLObjectType,
  type GraphQLOutputType,
  type GraphQLSchema,
  type SelectionSetNode,
} from 'graphql';
import { describe, expect, it } from 'vitest';

import { addPreprIds } from '../../codegen';
import { decodeStega, stegaClean } from '../stega/clean';
import { annotateEditLinks } from './edit-links';

// A Prepr-shaped schema: models and components implement `Model` /
// `Component`; dynamic content and stacks are unions; collections, assets
// lists and `_FocalPoint` carry no `_id` of their own where Prepr's don't.
const SDL = `
  interface Model { _id: String! }
  interface Component { _id: String! }
  type _FocalPoint { x: Int y: Int }
  type Asset { _id: String! url: String caption: String focal_point: _FocalPoint }
  type Assets { items: [Asset!]! }
  type Text { _id: String! body: String html: String text: String }
  type Button implements Component { _id: String! text: String link: String }
  type Hero implements Component {
    _id: String! heading: String image: Asset buttons: [Button!]!
  }
  type SEO implements Component { _id: String! title: String description: String }
  union Content = Text | Hero | Assets
  type FeatureGrid implements Component {
    _id: String! title: String body: [Content!]! features: [Feature!]!
  }
  type Feature implements Component { _id: String! title: String text: String }
  type Author implements Model { _id: String! name: String bio: [Content!]! }
  type Post implements Model {
    _id: String! title: String intro: String authors: [Author!]! content: [Content!]!
  }
  union Section = Hero | FeatureGrid | Post
  type Page implements Model {
    _id: String! title: String content: [Content!]! sections: [Section!]!
    related: [Post!]! _seo: SEO
  }
  type Pages { items: [Page!]! total: Int! }
  type Posts { items: [Post!]! total: Int! }
  type Query { Page(slug: String): Page Pages: Pages Posts: Posts }
`;

const CONTENT = `
  ... on Text { body html text }
  ... on Hero { heading image { url caption } buttons { text link } }
  ... on Assets { items { url caption } }
`;
const QUERIES = `
  query GetPage {
    Page(slug: "/") {
      title
      content { ${CONTENT} }
      sections {
        ... on Hero { heading buttons { text } }
        ... on FeatureGrid { title body { ${CONTENT} } features { title text } }
        ... on Post { title intro authors { name bio { ${CONTENT} } } }
      }
      related { title intro content { ${CONTENT} } }
      _seo { title description }
    }
  }
  query GetPages { Pages { items { title content { ${CONTENT} } } total } }
  query GetPosts { Posts { items { title authors { name } } } }
  query Aliased { Page { headline: title blocks: content { ${CONTENT} } } }
`;

const PROJECTS: [string][] = [['prepr-shaped fixture']];

const EDIT = 'https://acme.prepr.io/content/edit';
let seq = 0;

interface Gen {
  schema: GraphQLSchema;
  fragments: Map<string, FragmentDefinitionNode>;
  modelId?: string;
}

function conditionMatches(
  schema: GraphQLSchema,
  condition: string | undefined,
  type: GraphQLObjectType,
): boolean {
  if (!condition || condition === type.name) return true;
  const t = schema.getType(condition);
  if (isInterfaceType(t))
    return type.getInterfaces().some((i) => i.name === condition);
  if (isUnionType(t)) return t.getTypes().some((m) => m.name === type.name);
  return false;
}

function gen(
  set: SelectionSetNode,
  type: GraphQLObjectType,
  g: Gen,
  depth: number,
): Record<string, unknown> {
  const isModel = type.getInterfaces().some((i) => i.name === 'Model');
  const id = type.getFields()._id ? `id-${++seq}` : undefined;
  const ctx: Gen = isModel && id ? { ...g, modelId: id } : g;
  const out: Record<string, unknown> = {};
  const visit = (s: SelectionSetNode) => {
    for (const sel of s.selections) {
      if (sel.kind === Kind.INLINE_FRAGMENT) {
        if (conditionMatches(g.schema, sel.typeCondition?.name.value, type))
          visit(sel.selectionSet);
      } else if (sel.kind === Kind.FRAGMENT_SPREAD) {
        const f = g.fragments.get(sel.name.value)!;
        if (conditionMatches(g.schema, f.typeCondition.name.value, type))
          visit(f.selectionSet);
      } else {
        const key = sel.alias?.value ?? sel.name.value;
        const name = sel.name.value;
        if (name === '__typename') {
          out[key] = type.name;
          continue;
        }
        const def = type.getFields()[name];
        if (!def) continue;
        if (name === '_id') {
          out[key] = id;
          continue;
        }
        out[key] = value(def.type, sel.selectionSet, name, type, ctx, depth);
      }
    }
  };
  visit(set);
  return out;
}

function value(
  t: GraphQLOutputType,
  set: SelectionSetNode | undefined,
  name: string,
  parent: GraphQLObjectType,
  g: Gen,
  depth: number,
): unknown {
  if (isNonNullType(t)) return value(t.ofType, set, name, parent, g, depth);
  if (isListType(t)) {
    if (depth > 6) return [];
    return [0, 1].map((i) =>
      value(t.ofType, set, name, parent, g, depth + 1 + i * 0),
    );
  }
  const named = getNamedType(t);
  if (!set) {
    if (named.name === 'String' && g.modelId) {
      // Prepr: text fields carry an edit link to the model; Text entries name no field.
      const field = parent.name === 'Text' ? '' : `&field=${name}`;
      return vercelStegaCombine(
        `text ${name}`,
        {
          origin: 'prepr.io',
          href: `${EDIT}/${g.modelId}?utm_campaign=vec&locale=en-US${field}`,
        },
        false,
      );
    }
    return named.name === 'Int' || named.name === 'Float'
      ? 1
      : named.name === 'Boolean'
        ? true
        : 'plain';
  }
  if (depth > 6) return null;
  let concrete: GraphQLObjectType;
  if (isAbstractType(named)) {
    const types = g.schema.getPossibleTypes(named);
    concrete = types[seq++ % types.length]!;
  } else if (isObjectType(named)) concrete = named;
  else return null;
  return gen(set, concrete, g, depth + 1);
}

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object')
    Object.values(v).forEach((x) => strings(x, out));
  return out;
}

function stripStega(v: unknown): unknown {
  if (typeof v === 'string') return stegaClean(v);
  if (Array.isArray(v)) return v.map(stripStega);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, stripStega(x)]),
    );
  return v;
}

function ids(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => ids(x, out));
  else if (v && typeof v === 'object') {
    const r = v as Record<string, unknown>;
    if (typeof r._id === 'string') out.add(r._id);
    Object.values(r).forEach((x) => ids(x, out));
  }
  return out;
}

describe.each(PROJECTS)('%s', () => {
  const schema = buildSchema(SDL);
  const all = parse(QUERIES);

  for (const withIds of [false, true]) {
    it(`${withIds ? 'with preprIds' : 'queries as written'}`, () => {
      seq = 0; // Same union members on every run.
      const doc: DocumentNode = withIds ? addPreprIds(all, schema) : all;
      const fragments = new Map(
        doc.definitions
          .filter(
            (d): d is FragmentDefinitionNode =>
              d.kind === Kind.FRAGMENT_DEFINITION,
          )
          .map((f) => [f.name.value, f]),
      );
      let ops = 0,
        texts = 0,
        withEntry = 0,
        withField = 0;
      for (const op of doc.definitions) {
        if (op.kind !== Kind.OPERATION_DEFINITION || op.operation !== 'query')
          continue;
        ops++;
        const query = print({
          kind: Kind.DOCUMENT,
          definitions: [op, ...fragments.values()],
        });
        const result = gen(
          op.selectionSet,
          schema.getQueryType()!,
          { schema, fragments },
          0,
        );
        const out = annotateEditLinks(result, query);

        // Visible content and every non-text value are unchanged.
        expect(stripStega(out)).toEqual(stripStega(result));
        // Idempotent.
        expect(annotateEditLinks(out, query)).toBe(out);

        const known = ids(result);
        const before = strings(result);
        const after = strings(out);
        expect(after.length).toBe(before.length);
        after.forEach((s, i) => {
          const was = decodeStega(vercelStegaSplit(before[i]!).encoded);
          if (!was) return;
          texts++;
          const now = decodeStega(vercelStegaSplit(s).encoded);
          expect(now, 'link still decodes').not.toBeNull();
          expect(now!.origin).toBe(was.origin);
          const a = new URL(was.href),
            b = new URL(now!.href);
          expect(b.pathname).toBe(a.pathname);
          for (const [k, v] of a.searchParams)
            expect(b.searchParams.get(k)).toBe(v);
          const entry = b.searchParams.get('entry');
          if (entry) {
            withEntry++;
            expect(known.has(entry), `entry ${entry} is a real _id`).toBe(true);
          }
          if (!a.searchParams.has('field') && b.searchParams.has('field')) {
            withField++;
            expect(b.searchParams.get('field')).toMatch(/^[A-Za-z0-9_]+\.\d+$/);
          }
        });
      }
      expect(ops).toBe(4);
      expect(texts).toBeGreaterThan(0);
      if (withIds) {
        // With every `_id` selected, text inside list entries is annotated,
        // and Text entries of the page itself get their field path.
        expect(withEntry).toBeGreaterThan(texts / 2);
        expect(withField).toBeGreaterThan(0);
      }
    });
  }
});
