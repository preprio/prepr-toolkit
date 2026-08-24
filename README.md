# Prepr Toolkit

A framework-agnostic TypeScript library that provides preview functionality, visual editing, and A/B testing for [Prepr CMS](https://prepr.io). One vanilla core, with thin wrappers for React, Next.js, Nuxt, Astro, and SvelteKit.

This is the monorepo. The published package lives in [`packages/toolkit`](./packages/toolkit) — its [README](./packages/toolkit/README.md) is the user-facing documentation: quick start, per-framework guides, and the complete API reference.

## Quick Start

```bash
npm install @preprio/toolkit
```

Then follow the [Quick Start](./packages/toolkit/README.md#quick-start-nextjs) for your framework: [Next.js](./packages/toolkit/README.md#nextjs), [Astro](./packages/toolkit/README.md#astro), [SvelteKit](./packages/toolkit/README.md#sveltekit), [Nuxt](./packages/toolkit/README.md#nuxt), [React](./packages/toolkit/README.md#react-no-framework), or [anything else](./packages/toolkit/README.md#any-other-framework).

Upgrading from the old Next.js-only `@preprio/prepr-nextjs` package? See the [migration guide](./MIGRATION.md).

## What's In Here

| Path                 | Description                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `packages/toolkit`   | The published `@preprio/toolkit` package — vanilla core plus the Next.js, Nuxt, Astro, and SvelteKit wrappers. |
| `examples/nextjs`    | App Router, middleware, Apollo Client, custom image loader.                                                    |
| `examples/astro`     | Astro middleware and the `.astro` components.                                                                  |
| `examples/sveltekit` | `hooks.server.ts`, `+layout.server.ts`, the `.svelte` components.                                              |
| `examples/nuxt`      | Nitro middleware, `runtimeConfig`, the `.vue` components.                                                      |
| `examples/express`   | Vanilla core — a hand-written adapter for an unsupported framework.                                            |
| `MIGRATION.md`       | Upgrading from `@preprio/prepr-nextjs` to `@preprio/toolkit`.                                                  |

A pnpm workspace (`packages/*`, `examples/*`) built with Turborepo.

## Running the Examples

Each example needs its own `.env`. Copy the template and fill in your Prepr GraphQL URL (Settings → Access tokens in Prepr):

```bash
cp examples/nextjs/.env.example examples/nextjs/.env
```

Install once at the root, build the package, then start the example you want:

```bash
pnpm install
pnpm build
pnpm --filter example-nextjs dev
```

The other examples follow the same pattern — `example-astro`, `example-sveltekit`, `example-nuxt`, `example-express`.

## Development

```bash
pnpm install       # install all workspace dependencies
pnpm build         # build the published packages
pnpm test          # run the test suites
pnpm typecheck     # typecheck the published packages
```

These cover `packages/*` only — they are what the release workflow runs, so a release is never blocked by an example. The examples have their own commands:

```bash
pnpm build:examples       # build every example
pnpm typecheck:examples   # typecheck every example
pnpm check:all            # everything, packages and examples
```

The examples build and typecheck without a `.env` (`examples/sveltekit` reads `PUBLIC_PREPR_GRAPHQL_URL` through `$env/dynamic/public` at runtime, so nothing has to exist at compile time). They stay out of the release path anyway: a broken example should never block publishing the packages.

All commands run through Turborepo, so they are cached and only re-run what changed. To scope one to a single workspace:

```bash
pnpm --filter @preprio/toolkit test
```

The toolbar's CSS is compiled from `.css` sources into `*.generated.ts` files by `scripts/compile-css.mjs`. This runs automatically before build, test, and typecheck — the generated files are gitignored, so a fresh clone has none until you run one of those commands.

There is no CI on pushes or pull requests: checks run only when you push a `v*` tag, as the first half of the `Release` workflow. Nothing verifies a branch for you, so run `pnpm check:all` locally before you push — a mistake that reaches `main` stays invisible until someone cuts a release.

## Releasing

Push a `v*` tag and the `Release` workflow lints, typechecks, tests, builds and publishes to npm. See [`RELEASING.md`](./RELEASING.md) for the full walkthrough.

## Support

- **Documentation**: [Prepr Documentation](https://docs.prepr.io)
- **Support**: [Prepr Support](https://prepr.io/support)
