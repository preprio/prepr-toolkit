# Releasing `@preprio/toolkit`

Read this before your first release. You don't publish from your laptop — you push a
`v*` tag and CI does the rest. Your job is to get the version numbers right and push
the tag; everything after that is automated.

Current version is in `packages/toolkit/package.json`.

## Before your first release

Check that `NPM_TOKEN` exists in the repo secrets (Settings → Secrets and variables
→ Actions). It needs to be an npm **automation** token with publish rights. If it's
missing, ask someone with npm org access — you'll need it before any release can
work.

You only check this once. Skip it after that.

## Cutting a release

### 1. Start clean, on `main`

```bash
git checkout main && git pull
```

Make sure `git status` is clean and CI is green on `main`. If `main` is red, fix that
first — the release workflow runs the same checks and will fail in the same place.

### 2. Bump the version

```bash
pnpm --filter @preprio/toolkit version patch
```

Use `patch` for bugfixes, `minor` for new features, `major` for breaking changes.

### 3. Update `src/version.ts` to match

Open `packages/toolkit/src/version.ts` and set it to the exact version you just
bumped to. Two places, same number.

If you forget, `scripts/check-version.mjs` fails the build during `prebuild`. That's
the safety net — but it fires in CI *after* you've pushed the tag, and cleaning up a
pushed bad tag is annoying, so get it right here.

### 4. Commit, tag, push

The tag is the version with a `v` in front. Nothing else.

```bash
git commit -am "release: v0.1.1"
git tag v0.1.1
git push --follow-tags
```

`--follow-tags` pushes the commit and the tag together. A plain `git push` leaves the
tag sitting on your machine and nothing happens — if you pushed and no workflow
started, this is why.

### 5. Watch the workflow

Open the Actions tab and follow the `Release` run. In order, it:

1. verifies your tag matches `packages/toolkit/package.json` and fails immediately if not,
2. runs `pnpm typecheck`, `pnpm test`, `pnpm build`,
3. publishes to npm with [provenance](https://docs.npmjs.com/generating-provenance-statements),
4. creates a GitHub release with notes generated from the commits since the last tag.

Once it's green, confirm the version is live:

```bash
npm view @preprio/toolkit version
```

Every push to `main` and every PR runs the same typecheck/test/build through the `CI`
workflow, so a release failing at step 2 is unusual.

## Beta releases

Ship a beta when you want the package installable without affecting anyone on
`latest`.

Any version with a hyphen in it is treated as a prerelease automatically. It goes out
under the `beta` npm dist-tag and is marked as a prerelease on GitHub. `latest` is
untouched, so `pnpm add @preprio/toolkit` keeps resolving to the newest stable
version.

```bash
cd packages/toolkit && npm version 0.1.0-beta.2 --no-git-tag-version
# update src/version.ts to match
git commit -am "release: v0.1.0-beta.2"
git tag v0.1.0-beta.2 && git push --follow-tags
```

Note `--no-git-tag-version` here — you're tagging by hand in the next line, and
without the flag npm creates its own tag and you end up with two.

Testing a beta:

```bash
pnpm add @preprio/toolkit@beta
```

Going stable afterwards is just a normal release: bump to `0.1.0`, tag `v0.1.0`, and
it publishes to `latest`.

## Breaking changes

### 0.2.0-beta.1 — one preview runtime

`createPreprToolbar` and `createPreprScrollSync` were replaced by a single
`createPreprPreview`. Both old names are **removed**, not deprecated — pre-1.0, and
`createPreprScrollSync` had no known consumers.

```diff
-import { createPreprToolbar } from '@preprio/toolkit'
-createPreprToolbar({ props })
+import { createPreprPreview } from '@preprio/toolkit'
+createPreprPreview({ props })
```

`createPreprScrollSync()` becomes an explicit opt-out of everything else:

```diff
-createPreprScrollSync()
+createPreprPreview({
+  options: {
+    ui: false,
+    features: { segments: false, abTesting: false, editMode: false },
+  },
+})
```

Renamed types: `PreprToolbarController` → `PreprPreviewController`,
`CreatePreprToolbarOptions` → `CreatePreprPreviewOptions`. `PreprScrollSync` is gone.
`PreprToolbarOptions` still exists; `PreprPreviewOptions` extends it with `ui` and
`allowedEditorOrigins`.

The `<PreprToolbar>` components are unchanged in every framework — only the core
function was renamed. Apps using the wrappers need no changes.

The minor bump (rather than another `0.1.0-beta.x`) is deliberate: the break should
be legible in the version.

## When something goes wrong

### The tag didn't trigger anything

You forgot `--follow-tags`, or pushed the tag to the wrong remote. Check with
`git ls-remote --tags origin`.

### "Tag X != package.json Y"

Your tag and `package.json` disagree. Delete the tag, fix the version, tag again:

```bash
git tag -d v0.1.1
git push origin :refs/tags/v0.1.1
```

Then redo steps 2–4.

### The workflow failed after publishing

Check npm first with `npm view @preprio/toolkit version`. If the version is already
up there, the publish succeeded and only the GitHub release step failed — don't
re-run the workflow, since npm will reject the duplicate publish. Create the GitHub
release by hand instead.

### You published something broken

npm does not let you republish a version. Deprecate it and fix forward:

```bash
npm deprecate @preprio/toolkit@0.1.1 "Broken release, use 0.1.2"
```

Then cut a new patch release with the fix. Don't reach for `npm unpublish` — it only
works within 72 hours and it breaks every install that already resolved to that
version. Deprecate instead.

## Things to know

- **Version bumps are manual.** If a second publishable package ever lands in
  `packages/*`, switch to [Changesets](https://github.com/changesets/changesets) for
  per-package versioning, changelogs, and release PRs.
- **Release notes come from commit subjects.** Write conventional-commit style
  subjects (`fix:`, `feat:`, `chore:`) and the generated notes come out readable for
  free.
