# CLAUDE.md

Monorepo for `@preprio/toolkit` — preview, visual editing, and A/B testing for Prepr CMS. One vanilla core with thin wrappers for React, Next.js, Nuxt, Astro, and SvelteKit.

## Repo map

- `packages/toolkit` — the published npm package. Only this ships; everything in it is public surface.
- `examples/*` — one integration example per framework. Never in the release path; a broken example must not block a release.
- Docs: [`packages/toolkit/README.md`](packages/toolkit/README.md) is the user-facing documentation (quick starts, API reference — keep it in sync with actual exports). [`README.md`](README.md) covers repo setup. [`RELEASING.md`](RELEASING.md) is the release walkthrough.

## Workflow

- **Work on `develop`.** `main` only moves through PRs from `develop`. Never commit directly to `main`.
- **No CI on pushes or PRs.** The only automated checks run in the tag-triggered `Release` workflow. Run `pnpm check:all` locally before pushing — nothing else verifies your branch.
- **Releases**: push a `v*` tag; the workflow lints, tests, builds, and publishes. The version lives in **two places** that must match: `packages/toolkit/package.json` and `packages/toolkit/src/version.ts`. Full process in [`RELEASING.md`](RELEASING.md).
- Conventional-commit subjects (`fix:`, `feat:`, `chore:`) — release notes are generated from them.

## Commands

```bash
pnpm build / test / typecheck   # packages only — exactly what the release workflow runs
pnpm check:all                  # packages + examples (run this before pushing)
pnpm --filter @preprio/toolkit test   # scope to one workspace
```

Toolbar/stega CSS is compiled from `.css` into gitignored `*.generated.ts` files by `scripts/compile-css.mjs`; this runs automatically before build/test/typecheck. A fresh clone has no generated files until then — that is normal.

## Formatting and linting

- Prettier formats everything (`.prettierrc.json`, minimal config: single quotes); ESLint handles correctness only — `eslint-config-prettier` is last in `eslint.config.mjs`, so never add stylistic lint rules.
- On save: `.vscode/settings.json` runs Prettier as formatter plus ESLint autofix. Don't fight it — if a file looks unformatted, run `pnpm format`.
- `pnpm format` writes, `pnpm format:check` verifies; `check:all` includes the check, so unformatted code fails the pre-push gate.
- ESLint is scoped to `packages/*` on purpose (examples contain codegen output); Prettier covers the whole repo minus generated files (`.prettierignore`).

## Coding rules

### Architecture constraints

- The core (`packages/toolkit/src/core`) is framework-free. Framework specifics live only in the wrapper directories (`nextjs/`, `nuxt/`, `sveltekit/`, `astro/`, `react/`), typed structurally where possible (e.g. `AstroLikeContext`) so the core never imports a framework.
- `.vue`/`.svelte`/`.astro` components ship as **source** and are compiled by the consumer's pipeline — tsup never touches them. Their public API must stay in sync across frameworks (same props, same option names).
- Every request-derived value (cookies, query params, inbound headers) is hostile: it must pass `sanitizeHeaderValue` before reaching `Headers.set`, and parsing it must never throw (a crash here is a visitor-triggerable 500 in every consumer's middleware). Do not weaken these paths; extend the hostile-input test blocks when touching them.
- New wire messages over the iframe bridge must keep origin validation intact and stay backward-compatible — unknown inbound events are ignored, existing event shapes are frozen.

### Code comments

This is a published package: every comment ships to npm and shows up in consumers' editors through the `.d.ts` files. Write them for an external developer who has never seen this repo and has no access to the discussion that produced the code.

- **Explain why, not what.** The code says what it does. A comment earns its place by recording the constraint, browser quirk, or bug that forced the shape — like the `navigate` race in `toolbar-change-handler.ts`.
- **No internal shorthand or process labels.** No tool names, ticket IDs, agent or workflow markers, or personal conventions as comment prefixes.
- **No conversational voice.** Not "as we discussed", "for now", "you asked for", or first-person narration. State the fact in the present tense.
- **No `TODO`/`FIXME`/`HACK`.** Open work belongs in an issue, where it is tracked and searchable, not in a published `.d.ts`.
- **Describe the code, not its history.** "Batches every param write into a single call" ages well; "changed this to fix the reset bug" is meaningless to a reader who never saw the old version.
- **Reference public API, not file layout.** Consumers can see `createPreprPreview`; they cannot see `src/core/create-preview.ts`. Internal cross-references are fine in `.ts` sources but should not leak into exported doc comments.

Public exports get a JSDoc block covering what the function does, when to reach for it, and any gotcha a caller cannot infer from the signature.

### TypeScript conventions

- Named exports only from the package — no default exports except where a framework demands one (the `next/image` loader).
- Options land in a single trailing options object with optional fields, never positional boolean/config arguments. Keep option names identical across framework wrappers.
- Public API changes are semver events: removing or renaming an export, narrowing a type, or changing a default belongs in RELEASING.md's "Breaking changes" section (pre-1.0 removals are allowed but must be documented there).
- Prefer structural types over framework imports at wrapper boundaries (`AstroLikeContext`, `H3EventLike`, `SvelteKitRequestEvent`) — a peer dependency is only for code the consumer's framework actually compiles.
- New runtime dependencies are a last resort: the package's value is being a drop-in. Bundle tiny vendored pieces (as with preact) rather than adding peers.

### Performance conventions

Distilled from Vercel's React/JS performance guidance; these are the rules that apply to this codebase's shape (a hot-path DOM library plus thin framework wrappers):

- **Hot paths first.** The stega scanner, MutationObserver callbacks, and mousemove/scroll handlers run continuously on consumer pages. There: hoist `RegExp` creation to module level, use `Set`/`Map` for repeated lookups, exit early, and combine multiple `filter`/`map` passes into one loop.
- **Passive listeners.** `scroll`/`touch`/`wheel`/`mousemove` listeners that never call `preventDefault` are registered `{ passive: true }`.
- **One listener, not N.** Global listeners (window scroll, message, mutation observers) are registered once per controller and fanned out internally — never once per element.
- **React wrappers stay render-stable.** No components defined inside components; effects that must see the latest prop use a ref updated on every render (the latest-ref pattern) instead of re-running the effect; expensive `useState` initial values are passed as a function; non-primitive default props are hoisted to module scope.
- **Async: parallel by default.** Independent awaits go through `Promise.all`; an `await` moves into the branch that actually needs it. Server helpers never block on optional data (`getToolbarProps` swallows fetch failures and returns empty data by design — keep that contract).
- **Ship nothing extra.** Wrappers stay thin re-export layers; anything heavy loads lazily behind the feature that needs it. The toolbar bundle is injected into consumer pages — treat its size as a regression surface.

### Tests

- Vitest. Server-side middleware tests run under `// @vitest-environment node` (undici `Headers` rejects what happy-dom accepts — validation bugs pass silently under the wrong environment).
- A test encodes the regression it prevents: name it after the behavior, and when fixing a bug, first add the failing test that reproduces it.
