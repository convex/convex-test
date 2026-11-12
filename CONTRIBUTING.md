# Contributing

## Installation

Use Node.js 24:

```sh
npm ci
```

## Checks

```sh
npm run build
```

The build runs lint, formatting, typechecking and tests before compiling.
Use `npm run check` to run those checks without compiling.

## Releases

Add a Changeset for user-visible changes:

```sh
npx changeset
```

Review the generated **Prepare next release** PR's version and changelog,
including changes merged without a Changeset. Approve its Actions runs if
requested and wait for **Test and lint** before merging.

Merging stages the tested package from the exact version-bump commit and creates
its `v<version>` tag. Review the staged package on npm and approve with 2FA.
Keep the version PR open until a release is wanted.

For a manual version PR, run `npx changeset version`. Prepare prerelease versions
and changelog entries manually, with no pending Changesets.

If staging fails, check npm before retrying **Release** with the version-bump
commit SHA. If staging succeeded but tagging failed, rerun only the failed `tag`
job; a staged version cannot be reused. Source fixes need a new version.
