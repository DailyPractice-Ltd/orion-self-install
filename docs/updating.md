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

## If your harness is older than 0.5.7 (one time only)

The update layer itself — this file, and `update/manifest.json` — first shipped in
0.5.7. If your harness was installed before that, those files are not on your machine,
so **"update my harness" has nothing to act on**. Your AI is not being difficult; the
instructions that phrase refers to genuinely are not there.

One paste fixes it forever. Open your Orion folder in your AI and give it this:

> Fetch these two files and save them at these exact paths in this folder, creating the
> directories if they do not exist:
>
> - `https://raw.githubusercontent.com/DailyPractice-Ltd/orion-self-install/main/docs/updating.md`
>   → `docs/updating.md`
> - `https://raw.githubusercontent.com/DailyPractice-Ltd/orion-self-install/main/update/manifest.json`
>   → `update/manifest.json`
>
> Write nothing else. Then read `docs/updating.md` and run the procedure in it, starting
> at step 1.

That is the whole bootstrap. It fetches the instructions and the allowlist, then hands
over to the ordinary procedure below — which takes the backup, refuses to go backwards,
and cannot touch anything you made. From then on **"update my harness"** works the way
it does for everyone else, and this paste is never needed again.

**If the fetch fails on Codex**, it is the sandbox, not the network: apply
`agent/adapters/codex.md`'s one-time setting and try again. The same fix unblocks the
radio, which is why a harness in that state usually looks silent to Daily Practice as
well.

**Why we cannot do this for you.** The radio carries labels and timestamps, never files
or instructions, and nothing installs on your machine without you saying yes. So the one
thing we cannot do is reach in and add the missing files ourselves. You paste it, your
AI does the rest.

---

## The procedure (installer: follow exactly — no improvised steps)

**0. Network first, on Codex.** Fetching needs the same network access as the radio. If
any fetch prints a network failure, apply `agent/adapters/codex.md`'s sandbox fix first
(one setting, one-time), then resume. On a corporate machine that still can't reach the
template, stop honestly: `docs/radio.md`, "If the radio can't get through" — the same
one-line IT ask unblocks both.

**1. Resolve main's current commit, then fetch the manifest pinned to it.**
First read the commit `main` points at right now:
`https://api.github.com/repos/DailyPractice-Ltd/orion-self-install/commits/main` — take
the `sha`. Call it COMMIT. (If that request fails, fall back to the literal `main` in
every URL below and carry on — you keep the update, you lose only the freshness
guarantee.) Then fetch the manifest at that commit:
`https://raw.githubusercontent.com/DailyPractice-Ltd/orion-self-install/{COMMIT}/update/manifest.json`

Pin to the commit, never the bare `main`, for two reasons. `raw.githubusercontent.com`
caches the `main` ref for five minutes, so a release made in the last few minutes still
serves the old manifest and looks like "nothing to update" — a commit URL is always
fresh. And every file in step 4 is fetched from this same COMMIT, so an update can never
mix a new manifest with old file bodies. The local manifest describes the version you
HAVE; the commit's describes the version you're getting. Files added since this install
exist only in the commit's list — fetching the local one would miss them, which is
exactly the failure this rule prevents.

**2. Compare versions — never roll back.** Read `template_version` from the fetched
manifest and from `status/status.json`.
- Equal → say "already on {version} — nothing to update," and stop.
- Fetched older than local (should never happen against main) → **stop**, touch
  nothing, and say so plainly. An update never goes backwards.

**3. Back up before anything is replaced or removed.** Create
`.update-backup/{local-version}-{YYYY-MM-DD}/` and copy every file on the refresh list
**and every file on the `remove` list** that exists locally into it, preserving paths.
This is the undo. Do not skip it because the update "looks small."

**4. Refresh, allowlist only.** For each path in the manifest's `refresh` list: fetch
`https://raw.githubusercontent.com/DailyPractice-Ltd/orion-self-install/{COMMIT}/{path}`
— the same COMMIT resolved in step 1, so every file comes from one consistent snapshot —
and replace the local file (create it if it is new to this version). Two rules with no
exceptions:
- **A path not on the list is never written.** Not "also tidied," not "while we're
  here." The allowlist is the whole permission.
- **The personalisation tripwire**: before replacing, if a refresh-list file contains
  the client's business or personal name (someone hand-edited what should never have
  been), stop for that file, show the client the difference, and let them choose. The
  backup already holds their copy either way.

**4b. Prune, remove-list only.** If the fetched manifest has a `remove` list: delete
each named path that exists locally (its copy is already in the backup from step 3), and
tell the client in one plain sentence what was retired and why the release notes say so.
If it has `remove_status_checklist_keys`: delete those keys from `status/status.json`'s
`checklist` (they described steps that no longer exist). The same two rules apply in
reverse: **a path not on the `remove` list is never deleted** — not "also tidied" — and
a file the client visibly personalised gets the same tripwire: show them, let them
choose, the backup holds it either way.

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
