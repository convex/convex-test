# Contributing

## Installation

Use Node.js 24 and install dependencies with:

```sh
npm ci
```

## Checks

```sh
npm run build
```

The build runs lint, formatting, typechecking and the test suite before compiling
the package. Run `npm run check` for those checks without compiling.

## Releases

Include a Changeset for user-visible package changes:

```sh
npx changeset
```

Choose the bump for the intended next version: a patch advances 0.0.x, a minor
advances 0.x.0, and a major advances to 1.0.0. The Changesets workflow opens or
updates **Prepare next release** on main. Review the version, changelog and
consumed Changesets before merging it. Audit changes since the previous release
so the notes cover all user-visible changes, including PRs without Changesets.

Approve the version PR's GitHub Actions runs if GitHub requests approval, and
wait for **Test and lint** to pass. The version PR uses `GITHUB_TOKEN`, so a
maintainer may need to approve its `pull_request` runs. A manually dispatched
check does not replace a required PR check.

Merging a version bump to main runs **Release**. It selects the latest
version-bump commit in that push, checks out that exact commit, rejects pending
Changesets or missing release notes, runs the build and its checks, and packs
the tested output. A separate job verifies the tarball's SHA-256 and stages it
with npm trusted publishing and provenance. Only after staging succeeds does CI
create `v<version>` on that source commit. Later commits are excluded.

Staging reserves the version; it does not make it installable. Review the
workflow summary (including the stage ID), source commit and npm staged package,
then approve with npm 2FA on npm's Staged Packages page or
`npm stage approve <stage-id>`. Approve multiple versions on a channel in version
order.

### One-time setup

- Allow GitHub Actions to create pull requests in this repository's Actions
  settings.
- Require the always-running **Test and lint** check on main. The path-filtered
  workflow lint checks are separate.
- Configure a stage-only trusted publisher for `convex-test`, repository
  `convex/convex-test`, workflow `release.yml`, before the first CI release:

  ```sh
  npm trust github convex-test --repo convex/convex-test --file release.yml --allow-stage-publish
  ```

  New trusted-publisher relationships need their first successful publish within
  two days, so configure this near the first release. No npm token is needed in
  GitHub Actions.

This setup does not bump or stage a version. Keep the generated version PR open
until a release is wanted.

### Manual versions and prereleases

To prepare a version PR without the bot, run `npx changeset version`, review and
commit the changes, and open a PR. Changesets updates the version and changelog
and consumes pending Changesets. Do not use the old local npm publishing scripts.

Prepare prereleases in a reviewed PR that bumps the package version and adds a
matching changelog section. The release commit must have no pending Changesets.
The workflow derives the npm channel from the first prerelease identifier
(e.g. `alpha`), and uses `latest` for stable versions. Changesets prerelease mode
retains consumed notes and is not supported by this workflow's zero-Changeset
gate; prepare prerelease versions manually instead.

### Recovery

If staging failed, inspect npm's staged and published versions first. If the
version is not reserved, dispatch **Release** from main with the full
40-character version-bump commit SHA. The workflow validates the version increase,
reachability and existing tag target before building.

If staging succeeded but tagging failed, verify the staged package and rerun
only the failed `tag` job in the original workflow run. Do not restage a reserved
version. If the source needs fixing, merge a new release PR with the next version;
the failed version remains unpublished. Never move an existing version tag.

See the [shared release design](https://app.notion.com/p/400b57ff32ab807681afe570d910eb0f)
and [npm staged publishing documentation](https://docs.npmjs.com/cli/v11/commands/npm-stage/).
