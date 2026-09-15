# Updating — "update my harness", and everything that promise means

The client says **"update my harness."** That is the entire interface. Everything below
is what their AI does with it, and the guarantees are enforced by an allowlist, not by
anyone remembering them.

**The promise, in one paragraph, for the client:** an update refreshes Daily Practice's
files — the instructions, the adapters, the Library recipes, the scripts — and cannot
touch yours. Your knowledge base, your hired agents, the skills you've taught, your
status file, your shift log, and every file you created stay exactly as they are. Every
file the update replaces is copied aside first, so any update can be undone by saying
**"restore my harness from the backup."** Updates never go backwards.

**If any other file describes updating differently, this file wins.** The allowlist
lives in `update/manifest.json`; a path not on it may not be written, ever.

## Which version am I on? (client)

Ask your AI: **"what version is my harness on?"** It reads `template_version` from
`status/status.json` and tells you, e.g. "0.3.0". Then look at the Releases page:

https://github.com/DailyPractice-Ltd/orion-self-install/releases

The top entry is the latest. Every release lists, in plain words, what changed and why
it matters to you. If your number is lower than the top one, say **"update my
harness"** and the procedure below runs. If it is the same, there is nothing to do.
Daily Practice can also see your version over the radio, and will tell you when an
update is worth your time — you never have to check by hand.

**For maintainers:** a release is a `## X.Y.Z — date` heading in `CHANGELOG.md` with a
git tag `vX.Y.Z` on the commit that shipped it. Push the tag and
`.github/workflows/release.yml` publishes the release with that heading's section as
the notes. The version a client sees in `status.json` and the version on the Releases
page are the same number by construction.

---

## The procedure (installer: follow exactly — no improvised steps)

**0. Network first, on Codex.** Fetching needs the same network access as the radio. If
any fetch prints a network failure, apply `agent/adapters/codex.md`'s sandbox fix first
(one setting, one-time), then resume. On a corporate machine that still can't reach the
template, stop honestly: `docs/radio.md`, "If the radio can't get through" — the same
one-line IT ask unblocks both.

**1. Fetch the manifest from main — always main's copy, never the local one.**
`https://raw.githubusercontent.com/DailyPractice-Ltd/orion-self-install/main/update/manifest.json`
The local manifest describes the version you HAVE; main's describes the version you're
getting. Files added since this install exist only in main's list — fetching the local
one would miss them, which is exactly the failure this rule prevents.

**2. Compare versions — never roll back.** Read `template_version` from the fetched
manifest and from `status/status.json`.
- Equal → say "already on {version} — nothing to update," and stop.
- Fetched older than local (should never happen against main) → **stop**, touch
  nothing, and say so plainly. An update never goes backwards.

**3. Back up before anything is replaced.** Create
`.update-backup/{local-version}-{YYYY-MM-DD}/` and copy every file on the refresh list
that exists locally into it, preserving paths. This is the undo. Do not skip it because
the update "looks small."

**4. Refresh, allowlist only.** For each path in the manifest's `refresh` list: fetch
`https://raw.githubusercontent.com/DailyPractice-Ltd/orion-self-install/main/{path}`
and replace the local file (create it if it is new to this version). Two rules with no
exceptions:
- **A path not on the list is never written.** Not "also tidied," not "while we're
  here." The allowlist is the whole permission.
- **The personalisation tripwire**: before replacing, if a refresh-list file contains
  the client's business or personal name (someone hand-edited what should never have
  been), stop for that file, show the client the difference, and let them choose. The
  backup already holds their copy either way.

**5. Prove the scripts survived the trip.** Run `node --check` on every `.mjs` file
just fetched. A truncated download must fail here, loudly, not at 07:00 tomorrow. On
any failure: restore that file from the backup and report which one.

**6. Record it.** In `status/status.json` (the client's file — this is the one field an
update may edit): set `template_version` to the new version, and append one line to
`notes`: "updated to {version} on {date}; backup in .update-backup/…".

**7. Prove the radio.** `node status/radio.mjs check` — expect "Radio quiet" or a real
message. "Didn't answer" here is the third-state rule from AGENTS.md: one plain
sentence, the fix pointer, never silence.

**8. Report, in plain words, short.** Version from → to; how many files refreshed and
how many are new; where the backup is; the one-line headline from the new CHANGELOG
entry; and the sentence that matters: **"your knowledge base, your agents, your skills,
your status and your logs were not touched."**

## Restoring

"Restore my harness from the backup" → copy everything from the newest
`.update-backup/{…}/` back over the current files, set `template_version` back to the
backup's version, append a notes line. One honest nuance: files that were **new** in the
update (they had no pre-update copy to back up) remain after a restore — they are inert
without the new instructions that referenced them, and the next update refreshes them
anyway. The backup folder itself is never deleted by any procedure — only the client may
clear old ones.

## Why the allowlist is the safety, in one paragraph (for maintainers)

Deltas rot and hand-written file lists miss things. The manifest is generated from the
repository's own inventory at each release (`_regenerate` inside it), the whole
ours-zone is refreshed every time (idempotent — replacing an identical file is a no-op),
and everything the client has ever made survives **by construction**, because nothing
outside the list can be written at all. The same three words therefore work from any
baseline: a 0.3.0 install and yesterday's install run the identical procedure and both
land on main.
