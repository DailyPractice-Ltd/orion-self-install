# What makes an Orion version publishable?

Type: grilling
Status: resolved

## Question

Define the boundary between work on `main`, a release candidate, and a published release. Which checks must pass before a tag is published, where must the changelog and release notes come from, and may a published tag ever be moved or replaced?

## Answer

`main` may contain multiple commits for an upcoming version. A release candidate is the exact commit proposed for publication. Clients may install a version only after a maintainer explicitly publishes a GitHub Release for a fixed `vX.Y.Z` tag pointing at that candidate. The tag and shipped files do not change after publication; a correction gets a new version.

Publication requires green CI on that exact commit, including the release inventory, historical fingerprints, and install/update tests. The public notes come from the changelog section **in that same commit**, not from whatever `main` contains later. For a major release or any release that runs a migration script, Henri also runs a manual local trial on a disposable deployed harness before publishing. The update itself runs the migration script when applicable; its exact rules belong to [Which installed harnesses may take a release?](04-compatibility.md).

Evidence from the current branch: `.github/workflows/release.yml` reads notes from `main` and does not gate publication on CI. `node --test tests/release-contract.test.mjs` currently fails because the manifest names a deleted Notion file and the test expects 3 skills where the branch has 11. These are release blockers under the chosen gate, not implementation work in this ticket.
