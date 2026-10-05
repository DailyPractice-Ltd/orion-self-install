# Updating — "update my harness", and everything that promise means

The client says **"update my harness."** That is the entire interface. Everything below
is what their AI does with it, and the guarantees are enforced by an allowlist, not by
anyone remembering them.

**The promise, in one paragraph, for the client:** an update refreshes Daily Practice's
files — the instructions, the adapters, the Library recipes, the scripts — and cannot
touch yours. Your knowledge base, your hired agents, the skills you've taught, your
status file, your shift log, and every file you created stay exactly as they are. Every
file the update replaces is copied aside first, so any update can be undone by saying
**"restore my harness from the backup."** Updates never go backwards. An update
runs start to finish without asking you anything: the three words are the yes. And a
Daily Practice file you have changed counts as yours: the update keeps it as it is.

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
page are the same number by construction. Before the tag, as the last edit of the
release, run `node tests/helpers/pristine.mjs --write`: `update/pristine.json` must
hold the fingerprint of every file as it ships, and `node --test` fails if it is stale.

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

## The procedure (installer: follow exactly — no improvised steps, no questions)

**The request is the consent.** "Update my harness" is the yes. From here to step 8
there is nothing to ask the client: no "apply the prepared merge?", no diff to approve,
no "shall I continue?". The backup in step 3 is the safety, not a question. An update
that pauses for approval is an update that never happens: the client has walked away,
the question sits unanswered, and the harness stays old.

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
and, from the same COMMIT, `update/pristine.json`: the fingerprint of every copy of
every file Daily Practice has ever shipped. Step 4 uses it to tell the client's changes
from our files. If it cannot be fetched, stop and say so plainly; touch nothing.

**1b. Refresh the instructions before following them further.** Fetch
`docs/updating.md` from the same COMMIT and continue from step 2 using **the fetched
copy** — the local copy describes the version you have, not the one you're getting,
and a release can change the procedure itself (this step, and step 4b below, are the
proof). A harness whose local copy predates this step simply gains it on its next
update; the release nudge tells live harnesses when a one-off re-run is worth it.

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
- Equal → one check before stopping: if any path on the fetched manifest's `remove`
  list still exists locally, run steps 3 and 4b for those paths only (a maintenance
  pass — an earlier update under older instructions may have skipped the prune), say
  what was tidied, and then say "already on {version}." Otherwise say "already on
  {version} — nothing to update," and stop.
- Fetched older than local (should never happen against main) → **stop**, touch
  nothing, and say so plainly. An update never goes backwards.

**3. Back up before anything is replaced or removed.** Create
`.update-backup/{local-version}-{YYYY-MM-DD}/` and copy every file on the refresh list
**and every file on the `remove` list** that exists locally into it, preserving paths —
plus one copy of `status/status.json`, so even the checklist keys step 4b deletes have
an undo. This is the undo. Do not skip it because the update "looks small."

**4. Refresh, allowlist only.** For each path in the manifest's `refresh` list: fetch
`https://raw.githubusercontent.com/DailyPractice-Ltd/orion-self-install/{COMMIT}/{path}`
— the same COMMIT resolved in step 1, so every file comes from one consistent snapshot —
and replace the local file (create it if it is new to this version). Two rules:
- **A path not on the list is never written.** Not "also tidied," not "while we're
  here." The allowlist is the whole permission.
- **A file the client has changed is kept. Never replaced, and nobody is asked.** Some
  files on this list do not stay ours. The install itself writes the agent's identity
  into `agent/agent-definition.md`, and a client's own assistant may have added to
  `AGENTS.md`, `CLAUDE.md` or others. So before writing over a local file, check whether
  it is still one of ours: take its fingerprint and look for it under that path in the
  `update/pristine.json` fetched in step 1. Listed: it is a copy we shipped and the
  client never changed it, so replace it. Not listed: the file is the client's now.
  Leave it exactly as it is and name it in the step 8 report as kept. Do not replace
  it, do not merge it by hand, do not ask.
  The fingerprint is the SHA-256 of the file's text with every CRLF turned into LF.
  This prints it for any number of files, on any machine that can run the radio:
  `node -e "const c=require('crypto'),f=require('fs');for(const p of process.argv.slice(1))console.log(c.createHash('sha256').update(f.readFileSync(p,'utf8').replace(/\r\n/g,'\n')).digest('hex'),p)" FILE [FILE ...]`
  Two things are always replaced, changed or not. The radio's own scripts
  (`status/*.mjs`), because they run as a set and a mismatched set goes silent; a
  changed one is already in the backup from step 3, so name it in the report with the
  backup path. And `update/pristine.json` itself, which is pure data and has no entry
  of its own.

**4b. Prune, remove-list only.** If the fetched manifest has a `remove` list: delete
each named path that exists locally (its copy is already in the backup from step 3),
delete any directory that leaves empty, and tell the client in one plain sentence what
was retired and why the release notes say so.
If it has `remove_status_checklist_keys`: delete those keys from `status/status.json`'s
`checklist` (they described steps that no longer exist; the pre-update copy in the
backup still holds them). The same two rules apply in
reverse: **a path not on the `remove` list is never deleted** — not "also tidied" — and
**every path on it is deleted without asking**; if one carried local edits, name it in
the step 8 report with the backup path. The backup holds it either way.

**5. Prove the scripts survived the trip.** Run `node --check` on every `.mjs` file
just fetched. A truncated download must fail here, loudly, not at 07:00 tomorrow. On
any failure: restore that file from the backup and report which one.

**6. Record it.** In `status/status.json` (the client's file — an update may edit
exactly three things in it: `template_version`, one appended `notes` line, and the key
deletions step 4b names — nothing else, ever): set `template_version` to the new
version, and append one line to `notes`: "updated to {version} on {date}; backup in
.update-backup/…".

**7. Prove the radio.** `node status/radio.mjs check` — expect "Radio quiet" or a real
message. "Didn't answer" here is the third-state rule from AGENTS.md: one plain
sentence, the fix pointer, never silence.

**8. Report, in plain words, short.** Version from → to; how many files refreshed,
how many are new, and what was pruned; where the backup is; every file kept because
the client had changed it, named, and any replaced radio script or removed file that
carried local edits, named with the backup path (statements, never questions); the
one-line headline from the new CHANGELOG entry; and the sentence that
matters: **"your knowledge base, your agents, your skills and your logs were not
touched — and in your status file, only the version number, one note line, and any
retired checklist entries changed. Nothing of yours."** Apart from a hard stop in step
0 or step 2, this report is the only thing the update says to the client, and it comes
after the work, never before it.

**When an update changes what check-ins share, the client hears that in full.** The
headline is the bold sentence directly under the version's heading in `CHANGELOG.md`.
Read the entries for every version above the one the client was on, not only the
newest. If any of them says the harness now tells Daily Practice something it did not
tell it before, read that entry's headline to the client word for word, as its own
sentence. Do not summarise it, and do not skip it because the update looks small.
1.1.0 is the first such release: from 1.1.0 a harness also reports a finished task's
general tag, a count, and which skill or agent ran, never the content. Then remind
them in one clause that check-ins are still one switch (`docs/radio.md`, "Saying no,
now or later").

## Restoring

"Restore my harness from the backup" → copy every **refresh-list and remove-list**
file from the newest `.update-backup/{…}/` back over the current files. 
`status/status.json` is the one exception — it is the client's live record and is
**never copied back wholesale**: from the backup's copy, re-add only the checklist
keys the update deleted, set `template_version` back to the backup's version, and
append a notes line. Everything else in the live status file (stages, packages,
pairing, notes written since) stays exactly as it is. One honest nuance: files that were **new** in the
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
