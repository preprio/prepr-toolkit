# Releasing `@preprio/toolkit`

> **For Prepr maintainers.** Publishing requires write access to this repository.
> If you are contributing a change, see [CONTRIBUTING.md](./CONTRIBUTING.md) — your
> work reaches npm through a maintainer cutting a release.

Read this before your first release. You don't publish from your laptop — you push a
`v*` tag and the `Release` workflow does the rest. Your job is to get the version
numbers right and push the tag; everything after that is automated.

Current version is in `packages/toolkit/package.json`.

## How the publish authenticates

There is **no npm token anywhere** — not in repository secrets, not on a laptop. npm
Trusted Publishing (OIDC) establishes the trust instead: npm accepts publishes of
`@preprio/toolkit` that come from `preprio/prepr-toolkit` via `release.yml`, and from
nothing else.

At publish time the workflow's `id-token: write` permission mints a short-lived
credential that npm verifies against that configuration. Nothing long-lived exists to
leak or rotate, and a fork cannot publish — the identity npm checks is the repository
_and_ the workflow file.

Trusted Publishing is configured on npmjs.com under the package's Settings → Trusted
Publisher. It is already set up; you should not need to touch it.

The publish step uses `npm publish`, not `pnpm publish`. Trusted Publishing is
implemented in the npm CLI and requires npm >= 11.5.1; `pnpm@9.15.0`, which this repo
pins, has no OIDC support in its own publish path. The runner's Node 22 ships npm
10.x, still below the threshold, so the workflow installs a current npm for that step
alone.

If this repo moves to a newer pnpm, check whether that version publishes via OIDC on
its own — if it does, the `npm install -g npm@latest` step can go and the publish can
go back to `pnpm publish --filter @preprio/toolkit`.

After a release, confirm what landed — the registry is the only source of truth for
what consumers get:

```bash
npm view @preprio/toolkit versions --json
npm view @preprio/toolkit dist-tags --json
```

## Version policy (pre-1.0)

The package is beta until `1.0.0`, and the version number is what says so — there is
no `beta` dist-tag on it. Every `0.x` release publishes to `latest`, so
`npm install @preprio/toolkit` just works, while semver's own pre-1.0 rule does the
gating: a caret range like `^0.2.0` will never resolve to `0.3.0` on its own, so a
breaking minor cannot reach anyone who did not ask for it.

While the version is below `1.0.0`:

| Change                                                                       | Bump      | Example           |
| ---------------------------------------------------------------------------- | --------- | ----------------- |
| Breaking change — an export removed, renamed, or narrowed; a default changed | **minor** | `0.2.3` → `0.3.0` |
| New feature, backward compatible                                             | **patch** | `0.2.3` → `0.2.4` |
| Bugfix                                                                       | **patch** | `0.2.3` → `0.2.4` |

Adding features does not need a `major`, and shipping one does not end the beta —
keep landing them as patches until the API is worth freezing.

Every breaking change gets an entry in [Breaking changes](#breaking-changes), newest
first, with the diff a consumer needs to apply. That section is the migration guide;
pre-1.0 permits removals without a deprecation cycle, which only stays reasonable if
each one is written down.

Reserve `major` (`1.0.0`) for the point where the API is stable and you are willing
to hold it. At that release, drop the beta banner from
[`packages/toolkit/README.md`](packages/toolkit/README.md) and normal semver takes
over: breaking changes become `major`, features `minor`, fixes `patch`.

## Cutting a release

### 1. Get the changes onto `main`

Work accumulates on `develop`. A release starts by merging it into `main`:

```bash
gh pr create --base main --head develop --title "release: vX.Y.Z"
```

Merge that, then start clean from `main`:

```bash
git checkout main && git pull
```

Make sure `git status` is clean, then run `pnpm check:all` locally and confirm it
passes. Nothing has verified `main` for you — the release workflow is the only thing
that runs the checks, so anything broken surfaces after you have pushed the tag,
which is the most annoying time to find out.

### 2. Bump the version

```bash
pnpm --filter @preprio/toolkit version patch
```

Pre-1.0, `patch` covers both bugfixes and new features, and `minor` is what a
breaking change gets — see [Version policy](#version-policy-pre-10). Once the
package hits `1.0.0`, this becomes plain semver: `patch` / `minor` / `major`.

### 3. Update `src/version.ts` to match

Open `packages/toolkit/src/version.ts` and set it to the exact version you just
bumped to. Two places, same number.

If you forget, `scripts/check-version.mjs` fails the build during `prebuild`. That's
the safety net — but it fires in CI _after_ you've pushed the tag, and cleaning up a
pushed bad tag is annoying, so get it right here.

### 4. Commit, tag, push

The tag is the version with a `v` in front. Nothing else.

**Run the preflight check first.** A tag pushed against the wrong commit cannot be
deleted, so the version number is lost — this has cost two numbers already:

```bash
pnpm preflight:tag
```

It verifies you are on `main`, in sync with `origin/main`, with a clean tree, both
version locations matching, and the tag not already taken. It prints the exact tag
commands when everything passes.

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

Green is not proof. Confirm the version is actually live — and that it landed on the
dist-tag you expected:

```bash
npm view @preprio/toolkit versions --json
npm view @preprio/toolkit dist-tags --json
```

If your version is missing, the run should have failed — read the `Publish` step's
log. `ENEEDAUTH` means OIDC did not authenticate (check that Trusted Publishing on
npmjs.com still points at `release.yml`, and that the workflow kept its
`id-token: write` permission).

These checks run nowhere else — there is no CI on pushes or PRs — so step 2 is the
first time anything is verified. Run `pnpm check:all` before tagging and it will not
surprise you.

## Prerelease versions

Separate from the pre-1.0 beta above: ship a prerelease when you want a specific
version installable for testing without affecting anyone on `latest`.

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

Pre-1.0, a breaking change ships as a **minor** bump (see
[Version policy](#version-policy-pre-10)). Every one gets an entry here, newest
first, with the diff a consumer applies to upgrade — that is what makes removing
an export without a deprecation cycle reasonable.

### 0.3.2 — click-to-edit skips elements that render no box

> `v0.3.0` and `v0.3.1` were both tagged against a commit whose tree still held the
> previous version — `main` had not yet merged the bump either time — so the release
> run failed its version check before publishing. The ruleset blocks tag deletion, so
> both remain in the history pointing at commits that never shipped. `0.3.2` is the
> first release of this change.

No API changed. Edit mode now refuses to tag an element that cannot be hovered or
outlined, so a site that hides the stega payload in a `display: none` /
`visibility: hidden` / `hidden` element loses a tag it was previously given.

Nothing observable breaks: those elements were tagged and permanently inert. The
overlay measures `getBoundingClientRect()` and hover resolves through `closest()`
from the moused-over element, so an element with no layout box could never receive
either. The tag existed and did nothing.

`data-prepr-edit-target` is how a hidden payload becomes editable — put it on the
visible ancestor that should take the outline and the click:

```diff
-<p>Product title<span hidden>{encodedPayload}</span></p>
+<p data-prepr-edit-target>Product title<span hidden>{encodedPayload}</span></p>
```

The attribute is not new — `createStegaAutoClean` already honoured it while the
click-to-edit tagging pass did not, so the two passes disagreed about which element
was editable for the same markup. Both now resolve the target the same way.

Sites that render encoded text normally (the overwhelmingly common case, where the
payload rides on the visible text node) are unaffected.

## When something goes wrong

### The tag didn't trigger anything

You forgot `--follow-tags`, or pushed the tag to the wrong remote. Check with
`git ls-remote --tags origin`.

### "Tag X != package.json Y"

Your tag and `package.json` disagree. The usual cause is tagging `main` before the
release PR that carries the version bump was merged, so the tag points at a tree
still holding the previous version.

**The tag cannot be reused.** Deleting it locally works, but the ruleset rejects the
remote delete:

```
! [remote rejected] v0.3.0 (push declined due to repository rule violations)
```

So the burned version number is gone for good. Recover by releasing the next patch:

```bash
git checkout main && git pull          # confirm the bump is actually on main
```

Bump both version locations to the next patch, commit, and tag that. Add a note to
the new version's [Breaking changes](#breaking-changes) entry recording which tag was
stranded and why — `v0.2.0-beta.1` and `v0.3.0` both have one.

To avoid it entirely: merge the release PR first, then `git checkout main && git
pull`, confirm `package.json` reads the version you are about to tag, and only then
create the tag.

### A tag exists that was never published

`v0.2.0-beta.1` is tagged but never reached npm — its release run failed at
`pnpm typecheck` before the publish step. A repository ruleset blocks tag deletion, so
it stays in the history pointing at a commit that never shipped. Skip the version and
tag the next one; do not try to reuse it.

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
