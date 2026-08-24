# Contributing to `@preprio/toolkit`

Thanks for your interest in the toolkit. Bug reports, fixes, docs improvements, and
new framework adapters are all welcome.

This project is maintained by [Prepr](https://prepr.io) and licensed under
[Apache-2.0](./LICENSE). By contributing you agree that your contributions are
licensed under the same terms.

## Before you start

**For a bug fix or a small docs change**, just open a pull request — no need to ask
first.

**For anything larger** — a new framework adapter, a public API change, a
restructure — open an issue first and describe what you have in mind. The toolkit's
API surface is consumed by production sites across several frameworks, so a change
that looks local often has implications elsewhere. A short conversation up front
saves you from writing something that has to be redone.

If you are reporting a bug, please include the framework and version you are using,
the toolkit version, and a minimal reproduction if you can manage one. The
[examples](./examples) are a good starting point for a repro.

## Setting up

You need Node >= 18.17 and pnpm 9 (the repo pins `pnpm@9.15.0` via `packageManager`,
so Corepack will select it for you).

```bash
git clone https://github.com/preprio/prepr-toolkit.git
cd prepr-toolkit
pnpm install
pnpm build
```

The [README](./README.md#running-the-examples) covers running the example apps.
Note that they need a Prepr GraphQL endpoint in a `.env` file — a free Prepr account
is enough. Most changes to the core can be verified through the test suite alone, so
you do not need an account to contribute.

## Branches

Two long-lived branches, and they mean different things:

| Branch    | What it is                                                              |
| --------- | ----------------------------------------------------------------------- |
| `develop` | Where work accumulates. **Target every pull request here.**             |
| `main`    | What is released. Only ever updated by a `develop` → `main` release PR. |

`main` is the repository's default branch, so GitHub preselects it when you open a
pull request. Change the base to `develop` — it is the easiest mistake to make here,
and the one reviewers catch most often.

## Making a change

### 1. Branch off `develop`

External contributors: fork the repository first, then branch from `develop` in your
fork.

```bash
git checkout develop && git pull
git checkout -b fix/segment-clear-stale-content
```

Name it `<type>/<what>`: `feat/`, `fix/`, `chore/`, `docs/`. Same vocabulary as the
commit subjects below.

### 2. Write the change

Add or update tests for anything that changes behaviour. The suites live next to the
code they cover (`src/core/*.test.ts`, `src/nextjs/nextjs.test.ts`, and so on), run
under Vitest, and are fast enough to run constantly.

**There is no CI on pull requests.** Nothing checks your branch automatically, so
run the checks yourself before pushing:

```bash
pnpm check:all
```

That is `build`, `test`, `typecheck`, `lint`, and `format:check` across packages and
examples. If it passes locally it will pass in the release run.

If you touched anything under `packages/toolkit/src`, build the examples too — they
consume the package's public entry points and catch export mistakes the unit tests
miss:

```bash
pnpm build:examples
```

### 3. Commit in conventional style

```bash
git commit -m "fix: clear segment cookie when preview mode is turned off"
```

Use `feat:`, `fix:`, `chore:`, or `docs:`. Release notes are generated from commit
subjects, so a clear subject line ends up in the changelog verbatim.

### 4. Open a pull request against `develop`

```bash
gh pr create --base develop --fill
```

The explicit `--base develop` matters — without it you get `main`, which proposes
shipping your branch straight to production.

In the description, cover what changed, why, and how you verified it. If it affects
public API, say so: that determines whether the next release is a patch, a minor, or
a beta.

### 5. Review

A maintainer will review it. Expect questions about edge cases across frameworks —
the core runs in five different runtimes, and behaviour that is obviously correct in
one is sometimes surprising in another.

Once merged into `develop`, your change is queued for the next release. It is not on
npm yet.

## Releases

Releases are cut by Prepr maintainers — see [RELEASING.md](./RELEASING.md) if you are
one. Publishing is automated and locked to this repository through npm Trusted
Publishing, so no one can publish the package from a laptop or a fork, with or
without credentials.

There is no fixed release schedule. If a merged fix is blocking you, say so on the
pull request and someone will cut a release.

To test a change before it is released, install the current beta:

```bash
pnpm add @preprio/toolkit@beta
```

Or point an example app at your local build — the `examples/` apps resolve the
package through the pnpm workspace, so `pnpm build` at the root is enough to see your
change in them.

## Things that will trip you up

- **The PR base defaults to `main`.** Set `--base develop` every time.
- **Nothing runs on your PR.** `pnpm check:all` locally is the only gate.
- **`src/version.ts` duplicates the version** from `package.json`. Only relevant if
  you are cutting a release, but `prebuild` will fail if the two disagree.
