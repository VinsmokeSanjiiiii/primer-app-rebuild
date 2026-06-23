# Update Engine Patch — Auto Version Bump

Wires your project's existing update engine (which reads `AppVersion` from
Firebase RTDB) to your Git workflow so that **every push to `main`
automatically bumps the version and writes the new value to RTDB**.
Installed users will then see the existing `AppUpdateModal` prompt on next
launch (or on their next `checkForUpdate()` tick).

## Files

```
.github/workflows/release-bump.yml        # bump + publish on push to main
.github/workflows/release-dry-run.yml     # preview a release (manual / PR)
.github/workflows/rollback.yml            # safe rollback to a prior version
.github/workflows/update-engine-tests.yml # CI for the scripts themselves
scripts/bump-version.mjs                  # bump + snapshot + RTDB write
scripts/rollback-version.mjs              # restore from /AppVersionHistory
scripts/test-update-engine.mjs            # unit + integration tests
```

## What happens on push to `main`

1. `update-engine-tests` job runs first — bump never executes against a broken script.
2. Commit messages since the last tag pick a bump level:
   - `BREAKING CHANGE` / `feat!:` → **major**
   - `feat:` → **minor**
   - anything else → **patch**
   - override with `[bump major|minor|patch|skip]` in any commit message.
3. `package.json` `version` is bumped.
4. `android/app/build.gradle` `versionName` is bumped and `versionCode` is incremented.
5. **The current `/AppVersion` is snapshotted to `/AppVersionHistory/<prev>`** before being overwritten. Nothing is lost.
6. `/AppVersion` is `PATCH`ed with a structured payload:
   ```json
   {
     "currentVersion": "1.0.1",
     "previousVersion": "1.0.0",
     "minimumSupportedVersion": "1.0.0",
     "mandatory": false,
     "releaseNotes": "Features:\n• feat: …\n\nFixes:\n• fix: …",
     "buildNumber": 2,
     "updatedAt": 1719100000000,
     "status": "published",
     "androidDownloadUrl": "https://…optional…"
   }
   ```
   `updateCheck.ts` already normalises both the legacy plain-string form and
   this object form, so no client changes are required.
7. Release notes are bucketed (Features / Fixes / Other), prepended to
   `CHANGELOG.md`, and used as the body of a **GitHub Release** at tag `vX.Y.Z`.
8. The bump commit (`chore(release): vX.Y.Z [skip ci]`) and tag are pushed back to `main`.

The workflow ignores its own bump commits, so it can't loop. RTDB write
happens **before** the git commit; a failed RTDB write aborts the run, so the
repo and database can never drift.

## Dry-run (preview only)

`release-dry-run.yml` runs:
- on every **pull request** to `main` → posts a preview comment with the
  computed next version and full bump log,
- and on **manual dispatch** with an optional bump-level override.

It sets `DRY_RUN=1`, so the script **reads** everything (git history, current
`/AppVersion`) but writes nothing — no file edits, no RTDB writes, no commits,
no tags.

Locally:

```bash
DRY_RUN=1 \
FIREBASE_DB_URL=https://your-rtdb.firebaseio.com \
FIREBASE_DB_SECRET=… \
node scripts/bump-version.mjs
```

## Rollback

`rollback.yml` is a manual workflow. Give it a version that exists under
`/AppVersionHistory/` and it will:

1. Snapshot the **current** `/AppVersion` to
   `/AppVersionHistory/<current>_rolledback_<timestamp>` so the rollback is
   itself reversible.
2. `PUT` the saved snapshot back to `/AppVersion`, restamped with
   `updatedAt` and `rolledBackAt`.

The workflow has a `dry_run` input to preview the operation safely. Use the
GitHub Environment **production** so reviewers can be required before any
rollback runs.

Locally:

```bash
ROLLBACK_TO=1.0.0 \
FIREBASE_DB_URL=… FIREBASE_DB_SECRET=… \
node scripts/rollback-version.mjs
```

## Tests

`scripts/test-update-engine.mjs` covers:

- semver parse / format / compare
- bump-level resolution (env, `[bump x]`, conventional commits, `BREAKING CHANGE`)
- patch / minor / major arithmetic
- release-notes bucketing
- **end-to-end dry-run** against a temp git repo: asserts no files change, no tags created, RTDB is not written
- **end-to-end real run** with mocked `fetch`: asserts `package.json`, `build.gradle` (`versionName` + `versionCode`), `CHANGELOG.md`, the `vX.Y.Z` git tag, and the exact PATCH payload sent to `/AppVersion.json`

Run locally: `node scripts/test-update-engine.mjs`. Runs automatically in CI
via `update-engine-tests.yml` and as a required prerequisite of
`release-bump.yml`.

## Required GitHub repo secrets

| Secret | Value |
| --- | --- |
| `FIREBASE_DB_URL` | e.g. `https://primerdb2-default-rtdb.firebaseio.com` |
| `FIREBASE_DB_SECRET` | A Realtime Database **Legacy Secret** (Firebase console → Project settings → Service accounts → Database secrets). Used only by these workflows. |

Optional:

| Secret | Effect |
| --- | --- |
| `ANDROID_DOWNLOAD_URL` | URL placed into `AppVersion.androidDownloadUrl` so the modal's "Download APK" fallback has a target. |
| `MIN_SUPPORTED_VERSION` | Overrides the default (`previous version`) for `minimumSupportedVersion`. |

Also enable **Settings → Actions → General → Workflow permissions → Read and write**.

## Commit-message controls

| Token in commit message | Effect |
| --- | --- |
| `[bump major\|minor\|patch]` | Force a specific bump level |
| `[bump skip]` or `[skip ci]` | Don't bump for this push |
| `[mandatory]` | Mark release as mandatory (non-dismissable modal) |
| `feat:` / `fix:` / `feat!:` / `BREAKING CHANGE` | Conventional-commit auto-detect |

## End-to-end user flow

```
git merge feature → main      (push)
        │
        ▼
GitHub Actions: update-engine-tests → release-bump
        │
        ├─ bump package.json + android versionName/Code
        ├─ snapshot old /AppVersion → /AppVersionHistory/<prev>
        ├─ PATCH /AppVersion       →  Firebase RTDB
        ├─ prepend CHANGELOG.md
        ├─ commit + tag + push to main
        └─ create GitHub Release vX.Y.Z
                                          │
                                          ▼
installed APK launches → checkForUpdate() → AppUpdateModal prompts user
```

## Safety summary

- **PATCH** on `/AppVersion` — never deletes fields it didn't write.
- **Snapshot before overwrite** — every previous release is preserved in `/AppVersionHistory`.
- **Tests gate the bump** — broken script ⇒ no release.
- **Dry-run on PRs** — every PR shows you the next version + notes before merge.
- **Rollback is reversible** — the rollback itself snapshots the version it's replacing.
- **Monotonic `versionCode`** — Play Store / sideload installs always satisfy Android's monotonic-versionCode requirement.
- **No loop** — `[skip ci]` guard on the bump commit.
- **No drift** — RTDB write happens before git push; failure aborts the release.
