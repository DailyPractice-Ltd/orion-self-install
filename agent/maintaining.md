# Maintaining Orion

This guide governs maintenance in the release source. Its presence here and a task
to change or inspect Orion select this path before the client session starts.
It stays outside the deployment map in `update/manifest.json`; installed client
folders continue to use the client instructions in `AGENTS.md`.

The same maintenance workflow applies in Codex and Claude Code.

Use the source, tests and permitted documentation in this checkout. The Sources
and Credentials restrictions in `AGENTS.md` apply here too. Client setup, pairing,
guard, radio, waiting-list and finished-work reporting procedures do not apply to
maintenance. Leave client status, credentials and business records alone.

## Finish a change

1. Check the working tree and requested base branch. Preserve existing work and
   create a descriptive branch using the user's or repository's naming convention
   from the requested base (otherwise the project's current integration branch).
   Use only this checkout.
2. Make the change and record user-visible behavior in the current Unreleased
   changelog section. Keep ordinary changes unreleased unless a release is requested.
3. An edit to a deployed file needs nothing else: each harness's installed-file
   receipt records what Orion installed there, so no fingerprint list is kept in
   the release, and merges, squashes and shallow clones do not matter. A folder
   without a receipt (1.x, or 2.0.0 installed before receipts) is never updated
   or switched; it reinstalls (`agent/reinstall-from-1.x.md`). To retire a file,
   list it in `update/manifest.json` (`deployment.retired`, or `remove`); an
   update removes it only where the receipt shows it untouched.
4. Run checks appropriate to the change and review `git diff --check` and the diff.
   For deployment or package changes, also run the release contract below for both
   supported tools, regardless of which assistant is running. Resolve failures
   before committing; report any checks that could not run and why.
5. When requested, commit only the intended files. Push the branch and open a PR
   against the requested base when authorized. Report the commit, PR and validation.

A completed change does not itself select a new version or create a release tag.

To try or deliver a candidate on a deployed harness before it reaches `main`, push its
commit and update the harness to that full commit ([Pin a selected
commit](updating.md#pin-a-selected-commit)). No merge or tag is needed. The harness's
installed-file receipt, not the commit's ancestry, decides what the update may replace,
so the same conflict, backup and recovery rules apply as for `main`.

## Select and validate a release

Choose the version from the highest-impact change since the previous release:

- **Patch:** compatible fixes and documentation corrections.
- **Minor:** compatible new features.
- **Major:** breaking changes, including a required reinstall or incompatible client
  behavior or deployment changes.

Explain the choice using the actual changes. `template_version` in
`update/manifest.json` is the one hand-edited version; plugin manifest versions are
generated from it with `node update/plugin-package.mjs --write`, never edited by
hand. 2.0.0 was cut by hand. For later releases:

1. Consolidate pending notes into one first `## Unreleased — <title>` section in
   `CHANGELOG.md`. Select an explicit `X.Y.Z` greater than the current version.
2. Run `node update/bump.mjs X.Y.Z`. It dates the changelog, updates the version
   and generates plugin manifests together. It needs no Git history, and does not
   commit, tag or push.
3. Review the generated diff, then run:

   ```bash
   node --test
   node update/release-contract.mjs --tool codex --version X.Y.Z
   node update/release-contract.mjs --tool claude-code --version X.Y.Z
   git diff --check
   ```

   Substitute the selected version in both commands. All must pass on the final
   candidate. CI also runs the tests on Linux, macOS and Windows with Node 22.
4. Commit the validated release changes. Create an annotated `vX.Y.Z` tag on that
   exact commit when a release is requested. Never move an existing release tag;
   investigate a conflict before proceeding.
5. Push or publish only with explicit authorization for those actions. Pushing a
   version tag triggers `.github/workflows/release.yml`, which validates the
   candidate and creates or updates the GitHub release. Its manual dispatch can
   also create and push the tag after validation. Choose one route and verify the
   existing tag/release state before retrying any uncertain publication.

Release notes come from `CHANGELOG.md` on `main`, while validation runs on the
candidate commit. Ensure the intended notes are on `main` before publication.
Client updates also read `main` through `agent/updating.md`; review that exposure
when merging release changes. Report local commit/tag state separately from
confirmed remote publication.
