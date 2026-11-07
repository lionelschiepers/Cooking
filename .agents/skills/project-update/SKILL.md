---
name: project-update
description: "Update this project's pnpm dependencies, pnpm version and SHA-pinned GitHub Actions to their latest releases. Checks every version, rewrites package.json and the workflow pins, refreshes the lockfile, verifies the build and records what each update taught. WHEN: update packages, update dependencies, update npm packages, update GitHub Actions, bump versions, upgrade dependencies, latest versions, pnpm outdated, upgrade pnpm, dependency update."
---

# Update the project

Everything versioned lives in two places:

- `package.json`: `dependencies`, `devDependencies` and `packageManager` (`pnpm@x.y.z`).
- `.github/workflows/*.yml`: `uses: owner/repo@<full SHA> # vX.Y.Z`, pinned to the commit the tag points to.

`project-update.js` reads both, asks npm and GitHub for the latest release, and prints what is behind. It uses the npm registry, the `/releases/latest` redirect on github.com and `git ls-remote`, so it needs no token and no GitHub API quota.

Read **Findings** below before updating: it is what earlier updates learned.

## Steps

1. Health-check the skill first: `node .agents/skills/project-update/project-update.js --check`. Every case must be `ok`. If one fails, fix the skill before updating anything.
2. Start from a clean or known state: `git status --short`. Do not revert changes you did not make. Node and git must be installed; dependencies do not need to be.
3. Report only:

   ```powershell
   node .agents/skills/project-update/project-update.js
   ```

   The table shows `current -> latest (major|minor|patch)`. The **Node.js** block reports the newest release, the latest LTS, `engines.node` and the `node-version` used by the workflows.
4. Decide about **major** updates before writing anything. Read their release notes (npm page, GitHub releases). A major can need code changes or a newer Node. Leave one out with `--skip <name>`; tell the user why. Never mix a skipped package into the same `--write` run.
   - `engines.node` is the minimum the project supports, not a target: do not raise it just because a newer Node exists.
   - Change the workflow `node-version` only when the new release is stable (no `-alpha`, `-beta`, `-rc` in its version).
5. Apply:

   ```powershell
   node .agents/skills/project-update/project-update.js --write
   ```

   It rewrites the versions in `package.json`, the `packageManager` value and every pinned action (SHA **and** `# tag` comment). It writes nothing else.
6. Refresh the lockfile: `pnpm install`. pnpm switches to the version in `packageManager` by itself, so no `npx` is needed. Keep any new `pnpm-workspace.yaml` (see Findings).
7. Update the prose that hardcodes a version: `git diff` the old values and search them (`rg 'pnpm 11|Node 26|vite 8'`). `README.md` names the pnpm major and the Node version used by the deployment.
8. Validate: `pnpm run build`. It must succeed. Read the diff: `pnpm-lock.yaml` must only contain the intended version changes.
9. Format: `pnpm exec prettier --write package.json .agents/skills/project-update .github/workflows`.
10. Run the checker again: it must end with **Everything is up to date.** and no errors.
11. **Learn before finishing**: follow the self-improvement loop below. Then summarize every version that moved, what was skipped and why, and what changed in this skill. Do not commit or push unless the user asks.

## Self-improvement (required on every run)

The skill gets better one dated finding and one regression case at a time. A **finding** is anything this run did not handle on its own:

- an update the script missed, or a package/action reported with the wrong version or bump type;
- an action whose release tag and commit disagree, a tag that is not a commit, a workflow syntax the parser ignores;
- a major that needed code, docs or lockfile work, or a new file that holds versions;
- an error from npm, github.com, git or pnpm, or a command whose output changed;
- a step of this file that was wrong, missing or unclear, or a manual fix you had to make.

Before finishing **every** run:

1. **Fix the cause** in `project-update.js`, never the symptom. Read versions; never hardcode a current version.
2. **Prove it** with a regression case in `references.json`:
   - reuse an existing `fn` whenever possible;
   - if the fix adds a pure function, register it in `CHECKS` and give the case `fn`, `input`, `expect` and `why`;
   - use the real values that failed (version, tag, workflow line) so the case reproduces the bug offline.
3. **Run** `node .agents/skills/project-update/project-update.js --check`. A failure means the fix or the case is wrong; do not continue until it passes.
4. **Record it** with `node .agents/skills/project-update/project-update.js --learn "<one-sentence finding>"`. It appends a dated line to **Findings** and refuses duplicates.
5. **Re-run the update check** so the report matches the new behavior. Repeat the normal Steps if the fix changes the result.

If the run taught nothing, say so in the summary; do not invent a finding. The check suite is the skill's memory: a fix without a case in `references.json` will be lost the next time the script is rewritten.

### Regression functions

`references.json` calls these pure functions: `parseVersion`, `compareVersions`, `bumpType`, `isStable`, `nextSpec`, `parseUseLine`, `renderActionUse`, `tagFromReleaseUrl`, `pickCommit`, `isCurrentPin`.

Never store tokens or other secrets in the skill, and never edit `pnpm-lock.yaml` by hand.

## Options

| Option | Default |
| --- | --- |
| `--write` | report only |
| `--skip <a,b>` | nothing (package names or `owner/repo`) |
| `--check` | run the offline regression suite |
| `--learn "<text>"` | append a dated finding to `SKILL.md` |
| `--help` | show usage |

## What the script checks

- Every `dependencies` and `devDependencies` entry, through `https://registry.npmjs.org/<name>/latest`. The `^`/`~` prefix is kept.
- `packageManager`, when it is `pnpm@x.y.z`, through `https://registry.npmjs.org/pnpm/latest`.
- Every `uses: owner/repo@...` in `.github/workflows`. The latest release tag comes from the `/releases/latest` redirect (falling back to the highest semver tag). The commit comes from `git ls-remote --tags`, preferring the peeled `^{}` commit for annotated tags.
- Node.js releases, for information only: newest stable and latest LTS from `https://nodejs.org/dist/index.json`.
- With `--check`: every case in `references.json` plus the hygiene of this file (LF, a Findings section with dated entries, at least one case). Offline, fast, no network.

## Findings

- 2026-11-07: The npm registry answers `406` when it receives GitHub's `Accept: application/vnd.github+json` header. Requests now send only a `User-Agent`; do not share headers between the npm and GitHub calls.
- 2026-11-07: The unauthenticated GitHub REST API allows 60 requests per hour and returned `403` after a few test runs. The script no longer uses it: the latest tag is read from the `/releases/latest` redirect and the commit from `git ls-remote --tags`.
- 2026-11-07: `pnpm/action-setup@v6.1.1` is an annotated tag. `uses:` must pin the peeled commit (`refs/tags/v6.1.1^{}` from `git ls-remote`), not the tag object SHA. The script prefers the peeled entry.
- 2026-11-07: pnpm 12 writes `pnpm-workspace.yaml` with a `minimumReleaseAgeExclude` list when a package is younger than the minimum release age (tailwind 4.3.5 was one day old), and adds `packageManagerDependencies.pnpm` to the lockfile. Commit both files; `pnpm install --frozen-lockfile` accepts them.
- 2026-11-07: `https://nodejs.org/dist/index.json` lists `v27.0.0-alpha...` first. Filter versions with a `-` suffix: Node 26.13.0 was the current LTS, so `node-version: '26'` stayed.
- 2026-11-07: GitHub releases and tags can differ. Prefer `/releases/latest` (it skips prereleases); the highest semver tag is only the fallback.
- 2026-11-07: `README.md` repeats the pnpm major ("pnpm 11") and the deployment Node version. The script only touches `package.json` and workflows, so prose that hardcodes a version must be updated by hand.
- 2026-11-07: The parsing and pinning rules had no offline tests, so a rewrite could silently change them. references.json and --check are now the skill's memory: every fixed bug gets a case.
