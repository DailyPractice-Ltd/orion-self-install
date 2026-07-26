# Screenshot shot list

**Status 2026-07-26**: the founder walked the real client journey, captured the shots,
and six of the seven now live in `docs/img/` (the three flow shots were
redaction-processed first — every filename, session title, and business name that
wasn't Orion's own was cropped or painted out before entering this public repo). Only
the website-lane pair (06a/06b) is still pending. **Why humans capture these rather
than an AI generating them**: most need a real logged-in account, and real accounts
carry real business data — the rule is crop or blur anything that isn't Orion's own,
every time, before a shot lands here.

Save each file at the exact path listed — the README references these paths, so they
appear the moment the files exist. No other change needed.

---

## Priority 1 — referenced directly in README.md

### `docs/img/01-github-code-button.png` — ✅ landed 2026-07-26

- **Screen**: the repository's GitHub page
  (https://github.com/DailyPractice-Ltd/orion-self-install).
- **Shows**: the green **Code** button circled, arrows to **Download ZIP** in the open
  dropdown.
- **Re-capture note (optional polish)**: current shot shows the logged-in maintainer
  view (Settings tab, "Use this template"); a logged-out/private-window capture would
  match a client's view exactly.

### `docs/img/02-unzipped-folder-contents.png` — ✅ landed 2026-07-26

- **Screen**: the unzipped folder open in Finder — `README.md`, `AGENTS.md`,
  `start.mjs`, and the `agent`, `crm`, `library` folders visible.
- **Re-capture note (optional polish)**: current shot is a French-localised Finder
  ("Nom", "Dossier"); an English-UI capture would suit the global audience better. Not
  blocking — the shape of the window is the point.

### `docs/img/03-move-to-its-home.png` — ✅ landed 2026-07-26 (redacted)

- **Screen**: two file windows — Downloads on one side, the home folder with
  **Github → Projects** on the other — mid-drag of `orion-self-install-main`, arrow
  from source to destination.
- **Redaction applied**: every row that wasn't Github / Projects / the Orion folder
  painted out, both panes.

### `docs/img/04-terminal-press-start.png` — ✅ landed 2026-07-26 (cropped)

- **Screen**: Terminal showing `cd ` with the dragged-in folder path, annotated
  *Type CD → hit Spacebar → drag the folder → hit Enter*.
- **Crop applied**: the Finder overlay (real project names) cropped out; the arrows
  pointing off-frame toward "your file window" are intentional.

### `docs/img/05-desktop-agent-open-folder.png` — ✅ landed 2026-07-26 (redacted)

- **Screen**: a desktop AI agent (the Claude app's **Code** tab) with its folder picker
  open at **Github → Projects → orion-self-install-main**, arrows to the Code tab, the
  folder path, and the Open button.
- **Redaction applied**: sidebar sessions, session cards, and every non-Orion folder
  name painted out.

### `docs/img/06a-claude-project-create.png` — ⬜ pending

- **Screen**: claude.ai, logged in, the Projects area — the "Create project" button
  and/or the naming screen right after.
- **Highlight**: a box around "Create project."
- **Caption** (already in README): "Example, in claude.ai: Projects → Create project →
  name it 'My Orion'. Every AI website has an equivalent."
- **Watch for**: recent chats/projects in the sidebar — collapse it or crop to the
  Projects area before saving.

### `docs/img/06b-claude-project-upload-files.png` — ⬜ pending

- **Screen**: inside a claude.ai Project, the add-files/knowledge area, ideally
  mid-file-picker with `AGENTS.md` selected.
- **Highlight**: a box around the add-files button.
- **Caption** (already in README): "Then add one file from your Orion folder:
  AGENTS.md."
- **Watch for**: same sidebar rule as 06a.

### `docs/img/07-use-orion-from-any-project.png` — ✅ landed 2026-07-26 (redacted)

- **Screen**: the desktop agent's folder picker at the **Github** folder level —
  arrows showing you can hop into Projects (or make a new folder), i.e. Orion is one
  open away from anywhere.
- **Redaction applied**: same as 05.

---

## Priority 2 — nice to have, not yet referenced in README.md

These would help inside `crm/attio/README.md`, `crm/hubspot/README.md`, and
`connectors/connector-checklist.md` — none are blocking. Say the word to wire
placeholder references once captured.

- **Attio → Settings → Developers → API keys**, mid-creation of a new key, with the
  access toggles visible.
- **HubSpot → Settings → Integrations → Private Apps**, the Scopes tab, with the five
  required scopes checked.
- **n8n**, the blank canvas right after first login, and separately, the "Import from
  file" menu item.
- **Gmail Drafts folder**, showing one staged draft — the single best "trust me, it
  really does just wait for you" image in the whole repository, worth prioritising if
  you only add one more.

---

## Format notes for whoever captures these

- PNG, reasonable width (a browser window at ~1280px wide is plenty).
- Crop tightly to the relevant area; a full-screen grab with a tiny relevant button
  isn't useful at inline sizes.
- **If a real account's screen shows real business data (contacts, deals, emails,
  session titles, other project names), crop or blur it out before saving** — this is
  the standing rule that was applied to shots 03/04/05/07, and it applies especially
  to the Gmail and CRM shots above.
