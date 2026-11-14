# Installing a published release

New clients run `node install-published.mjs --tool codex --target /path/to/client`
(or `--tool claude-code`). Add `--code YOUR-CODE` to pair the required radio.
No release is considered installed until the radio answers successfully. Exit 3
means paused; repeat the original command, with a fresh code if necessary.
Exit 2 means verification or installation failed. There is no branch, cached-source,
or installed-code fallback. Existing nonempty target folders are never overwritten.

A paused request lives in a private `.CLIENT-published-install` sibling directory.
Keep it to resume the same publication. It contains the pairing credential; do not
share it. Resume downloads and verifies the pinned source again, compares staged
files with that source, and confirms the radio. An interrupted prepared promotion
is revalidated before retrying. The atomic directory rename is the application
boundary: prepared status inside the private transaction is not an applied release.
The final `status/status.json` records `applied_release` with `tag`, `commit`,
`release_id`, `manifest_version`, and `applied_at` only in the promoted harness.

`install.mjs` remains the offline maintainer/test and legacy migration primitive.
It does not certify a published installation. Private GitHub home setup is a
separate action after published installation.

## Shared release interface

`update/published-release.mjs` exports:

- `createReleaseClient({repository, apiBase, sourceUrl})`: GitHub release API and Git source.
- `discoverRelease(client)`: all release-list pages, highest eligible semantic version.
- `pinRelease(client, release, checkout)`: fresh checkout of peeled full commit,
  tag/manifest agreement, returning `{tag, commit, release_id, manifest_version}`.
- `verifyPinnedRelease(client, pin, checkout)`: fresh publication and remote tag check,
  clean pinned source and manifest verification immediately before an install/update write.
- `eligibleRelease`, `compareVersions`, and `WITHDRAWAL_MARKER` for shared catalog semantics.

Drafts, prereleases, invalid tags and withdrawn publications are ineligible.
Withdrawal is the exact `<!-- orion:withdrawn -->` marker in the GitHub Release body
(or `withdrawn: true` in a structured provider response). Never move the tag to withdraw.
A release lookup failure stops the operation; it does not select an older candidate.

The CLI defaults to `DailyPractice-Ltd/orion-self-install`. `--repository`,
`--api-base`, `--source-url`, and `--bridge-url` support controlled mirrors and local
fixture journeys. These configure trusted origins, not alternative fallback sources.
The pending request binds repository, API origin, Git source, target, tool and pin.
