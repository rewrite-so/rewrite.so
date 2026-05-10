---
name: release-extension
description: Cut a new versioned release of the rewrite.so Chrome extension. Use when the user asks to "release"/"publish"/"ship"/"发版"/"发布扩展"/"发布新版"/"打 tag 发版"/"上 Chrome 商店". Bumps version, pushes main, tags, monitors CI build, and hands off to the manual Web Store upload step.
allowed-tools: Bash(git:*), Bash(gh:*), Bash(pnpm:*), Bash(node:*), Read, Edit
---

# Release the rewrite.so Chrome Extension

End-to-end runbook for taking the current `main` branch and turning it
into a Chrome Web Store-ready zip via the `release-extension.yml`
workflow. The skill stops short of the actual Web Store upload — that
remains a deliberate human step (see "Why we don't auto-publish" below).

## Preflight (must pass before any tag is pushed)

Run all of these. If any fails, stop and ask the user — do not silently
fix dirty trees, lockfile drift, or merge conflicts.

```bash
git status                                # clean working tree
git rev-parse --abbrev-ref HEAD           # must be 'main'
git fetch origin && git status -sb        # in sync with origin/main
pnpm install --frozen-lockfile            # lockfile is honest
pnpm lint                                 # biome (CI gate)
pnpm typecheck                            # all 6 packages
pnpm test                                 # full suite
gh auth status                            # needed for `gh run watch`
```

If `git status` is dirty: ask the user whether to commit, stash, or
abort. Never `git stash` or `--force` anything without confirmation.

## Step 1 — Decide the new version

Read current state:

```bash
node -p "require('./apps/extension/package.json').version"
git tag -l 'ext-v*' --sort=-v:refname | head -3
```

### Recommend a bump from the commit log

Find the last released tag, then categorize commits since it:

```bash
LAST_TAG=$(git tag -l 'ext-v*' --sort=-v:refname | head -1)
git log ${LAST_TAG:+$LAST_TAG..}HEAD --pretty=format:'%s%n%b%n---' \
  -- apps/extension packages/core packages/shared
```

Apply Conventional Commits → SemVer mapping:

| Commit signal in the range above | Implied bump |
|---|---|
| Any subject with `!` after the type (`feat!:`, `fix!:`) **or** any body containing `BREAKING CHANGE:` | **major** |
| Otherwise, any subject starting with `feat(...)` or `feat:` | **minor** |
| Otherwise (only `fix` / `chore` / `docs` / `style` / `refactor` / `perf` / `test` / `polish`) | **patch** |
| No commits in scope at all | abort — nothing to release |

If the repo has no prior `ext-v*` tag (first release ever), default the
recommendation to **minor** unless the user says otherwise — `0.1.0` is
typical for an established but pre-1.0 product.

### Present the choice with the recommendation pinned first

Use AskUserQuestion. The recommended option goes first with "(Recommended)"
in the label. State the reason in the question text so the user can sanity-check:

> "Since the last release I see N feat / M fix / K other commits — recommending **minor** (X.Y.Z → X.Y+1.0). Pick a bump:"

Options:
1. **`<recommended>` (Recommended)** — e.g. "minor (0.1.0 → 0.2.0)"
2. The other two SemVer levels in plain order
3. **explicit** — let the user type a version

### Validation gates (after the user picks)

Before proceeding, fail loudly if any of these hold:

- `git tag -l "ext-v$NEW"` returns non-empty → tag already exists.
- `$NEW` ≤ current `package.json` version → Chrome Web Store rejects
  same-or-lower uploads.
- `$NEW` doesn't match `^\d+\.\d+\.\d+$` → manifest_version 3 requires
  three numeric segments (no pre-release suffixes for store builds).

Only `apps/extension/package.json` gets bumped — `@rewrite/core` /
`@rewrite/shared` are workspace-internal and don't ship to a store.

## Step 2 — Draft a user-facing changelog

```bash
LAST_TAG=$(git tag -l 'ext-v*' --sort=-v:refname | head -1)
git log ${LAST_TAG:+$LAST_TAG..}HEAD --oneline \
  -- apps/extension packages/core packages/shared CLAUDE.md
```

Show the result to the user and help them rewrite it as **end-user**
copy for the Web Store "What's new" field. Conventional-commit subjects
are CI-friendly but useless to actual users.

Bad:  `feat(core): clicking the trigger dot kicks off rewrite`
Good: `New: click the green dot in the corner to rewrite — same as Shift Shift.`

Save the rewritten copy somewhere the user can paste later (chat output
is fine; do not commit a CHANGELOG file unless they ask).

## Step 3 — Commit the version bump

Use the Edit tool on `apps/extension/package.json` (Manifest reads
`version` from it via `manifest.config.ts`). Then:

```bash
git add apps/extension/package.json
git commit -m "chore(extension): bump version to $NEW"
```

Do not amend earlier commits, do not reword history.

## Step 4 — Push main, then tag

```bash
git push origin main
git tag "ext-v$NEW"
git push origin "ext-v$NEW"
```

Path filters trigger automatically:
- `main` push → `deploy-api` + `deploy-web` (because `packages/**` change).
- `ext-v$NEW` tag → `release-extension.yml` (builds zip, creates GitHub Release).

## Step 5 — Wait for the release build

```bash
gh run list --workflow=release-extension.yml --limit 1
gh run watch --exit-status        # blocks until the run finishes
```

Expected: ~3–5 min. Common failures and how to handle them:

| Failure | Cause | Recovery |
|---|---|---|
| `pnpm install --frozen-lockfile` fails | lockfile drift since last green CI | Delete tag, regenerate lockfile, re-tag same version |
| biome / typecheck fails in CI | preflight (Step 0) was skipped or partial | Same as above — re-run preflight, fix forward, re-tag |
| zip step fails | rare; usually missing dist files | Check `apps/extension/vite.config.ts` build output |

To delete a tag (only with user confirmation — destructive, visible):

```bash
git push --delete origin "ext-v$NEW"
git tag -d "ext-v$NEW"
```

Prefer "fix forward" with `ext-v$NEW+1` over deleting tags whenever
commits have already been pushed to `main` between attempts.

## Step 6 — Hand off to manual Web Store upload

```bash
gh release view "ext-v$NEW" --web
```

Then tell the user, in plain numbered steps:

1. Download `rewrite-so-extension-ext-v$NEW.zip` from the release page.
2. Open <https://chrome.google.com/webstore/devconsole/> and select the
   rewrite.so item (store ID `gheiendipgcgiligfmbimbbffkkfiamk`).
3. **Package tab → Upload new package** → drop in the zip.
4. **Store listing tab → "What's new"** → paste the changelog from Step 2.
5. **Submit for review.** Typical review time: 24–72h. Until reviewed,
   users still see the previous version.
6. Optional but recommended: under **Distribution → Rollout**, choose a
   percentage (e.g. 20% → 50% → 100%) so a regression doesn't hit
   everyone at once.

Remind the user to **install the unpacked dev build and smoke-test the
core flows** (double-Shift, dot click, panel header brand, quota chip,
tooltip first-popup) before clicking Submit. Once submitted, only a new
version can fix a regression.

## Why we don't auto-publish (yet)

The CI workflow deliberately stops at "zip uploaded to GitHub Release".
Adding `PlasmoHQ/bpp@v3` to publish via the Chrome Web Store API is a
separate, deliberate infra change requiring four secrets
(`CHROME_EXTENSION_ID` / `CLIENT_ID` / `CLIENT_SECRET` / `REFRESH_TOKEN`)
and an OAuth refresh-token rotation policy. That tradeoff is documented
in `release-extension.yml` comments — do not surprise-add BPP from
inside this skill. If the user explicitly asks to automate the upload,
treat it as its own task with its own commit.

## Out of scope (don't do, even if asked mid-flow)

- Don't bump or tag any other workspace package — the extension is the
  only artifact with a public version.
- Don't `--amend` the bump commit. Append fix-forward commits instead.
- Don't touch unrelated tags. Other release lines (`deploy-api`,
  `deploy-web`) use untagged `main` pushes; never `ext-v*` tags.
- Don't run `pnpm --filter @rewrite/extension build` locally and try to
  zip / upload directly — production builds must go through CI so
  `EXT_STORE_BUILD=1` is set (otherwise the zip carries the dev manifest
  key and the Web Store rejects it).
