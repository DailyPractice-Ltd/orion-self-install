# Publish a verified Orion candidate

Publication runs only through an explicit **Release** workflow dispatch on `main`.
A changelog heading, pushed tag, or green build alone does not publish anything.

Before using the workflow, a repository administrator must enable GitHub immutable
releases, create the `release` environment with maintainer reviewers and a `main`-only
branch restriction, set its `HENRI_GITHUB_LOGIN` variable to Henri's actual GitHub login,
and store a repository-scoped `RELEASE_TOKEN` secret. The token needs Contents write,
Actions read, Issues read, and Administration read (to inspect immutable-release
settings). The workflow never enables settings or changes permissions itself.
GitHub's [immutable-release API](https://docs.github.com/en/rest/repos/repos#check-if-immutable-releases-are-enabled-for-a-repository)
is checked before publication. Missing settings or access fails closed.

1. Finish the candidate, including a matching `update/manifest.json` version and one
   nonempty `## X.Y.Z` changelog section. Regenerate pristine fingerprints. Commit it.
2. Run the **Test** workflow on that exact full commit (a push to main or manual Test
   dispatch on a ref pointing at it). All three OS unit jobs and scheduler jobs must
   succeed. The approved Test workflow runs `node --test` with full Git history:
   release inventory, historical fingerprints, installation and deployed update
   journeys are mandatory. The publisher rejects a candidate whose Test workflow
   differs from the trusted publisher checkout or lacks those test entry points.
3. Create and push an existing `vX.Y.Z` tag at that commit. The publisher never creates,
   moves or replaces tags. Tag pushes do not publish.
4. For a major version (`X.0.0`) or any migration script, Henri must try the exact
   candidate locally on a disposable deployed harness, including install/update and
   the applicable migration. Record the passed trial as a GitHub issue comment in
   this repository, authored by Henri, containing only this JSON (with real values):

   ```json
   {"tag":"v3.0.0","commit":"FULL_40_CHARACTER_COMMIT","local":true,"disposable_harness":true,"result":"passed"}
   ```

   Supply that comment's numeric ID to dispatch. A different author, tag, commit,
   failed result or missing local/disposable assertion is refused. Nested manifest
   script declarations and script files under migration directories trigger this gate.
5. Dispatch **Release** on main with the tag, full commit, and trial comment ID when
   required. Reviewers authorize that concrete nomination through the environment.

The publisher takes notes from the candidate Git object, verifies successful CI for
that SHA, rechecks the remote tag immediately before creation, and creates one stable
GitHub Release. An existing release (including a draft) is refused. There is no edit,
replace, force-tag or fallback path. Correct mistakes under a new version. Immutable
releases protect the published tag and assets; withdrawal may annotate the release
body without changing shipped bytes.

The CLI prints `{tag, commit, release_id, manifest_version}` after creation. The
GitHub Release is the authoritative catalog input: downstream importers must read its
current published/withdrawn state and pinned manifest, not treat this console record
as an independent publication. No bridge credentials are needed by the publisher.

## Withdraw a published release

Dispatch **Withdraw release** on `main` with the exact published tag, full
commit, and numeric GitHub Release ID. The same protected `release`
environment authorizes the edit. The workflow verifies the published release
and peeled tag, adds a withdrawal notice above the original notes, and reads
back the resulting body and identity. Re-running the same nomination verifies
the withdrawal without editing again.

GitHub permits [release-note edits on immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases).
Keep the original release and its tag for audit and backup verification. Keep
the `<!-- orion:withdrawn -->` marker in the notes and publish any correction
under a new version. The bridge reads the marker on radio check and surfaces a
withdrawal to paired harnesses that acknowledged the offer or recorded applying
the release. Fresh installs skip withdrawn publications. The agent update reads the current
`main` snapshot, so land a correction on `main` when withdrawing affected code.
