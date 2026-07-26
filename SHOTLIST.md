# Screenshot shot list

**The repository is live** (https://github.com/DailyPractice-Ltd/orion-self-install,
public, since 2026-07-26), so every shot below is now capturable. **Why these are
captured by a human at their own keyboard rather than generated**: most of them require
being logged into a real account — either a brand-new one (off-limits for an AI to
create on someone's behalf) or one of Daily Practice's own real, live business accounts,
which would risk capturing real client/business data in a screenshot destined for this
public template repo, even by accident, in the background of a browser tab or a sidebar
list. So: here's exactly what to capture.

Save each file at the exact path listed — the README already references these paths, so
they'll appear automatically the moment the files exist. No other change needed.

---

## Priority 1 — referenced directly in README.md

### `docs/img/01-github-code-button.png`

- **Capture once**: this repository is live on GitHub.
- **Screen**: the repository's main GitHub page, logged in or logged out (doesn't matter).
- **Action to show**: click the green **Code** button near the top-right of the file list
  — capture the dropdown it opens, with **Download ZIP** visible.
- **Highlight**: a red or yellow box/arrow around the "Code" button and around "Download
  ZIP" in the dropdown — both need to be findable at a glance, since this is the very
  first action a brand-new reader takes.
- **Caption** (already in README, for reference): "On the repository page, click the green
  'Code' button, then 'Download ZIP'."
- **Alt text** (already in README): "The green Code button on the GitHub repository page,
  with the Download ZIP option visible in the dropdown."

### `docs/img/02-unzipped-folder-contents.png`

- **Screen**: Finder (Mac) or File Explorer (Windows) — pick one, Mac is fine as the
  primary since Oliver's on a Mac; a Windows equivalent is a nice-to-have, not required.
- **Action to show**: the unzipped folder open, showing its contents — `README.md`,
  `AGENTS.md`, and the `agent`, `crm`, `connectors` folders should all be visible in the
  file list without scrolling.
- **Highlight**: none needed — the point is just "does my screen look like this."
- **Caption**: "You should see a folder full of files and folders like this — you're in
  the right place."
- **Alt text**: "A Mac Finder window showing the unzipped orion-self-install folder open,
  with files like README.md, AGENTS.md, and folders like agent, crm, connectors visible."

### `docs/img/03-claude-project-create.png`

- **Screen**: claude.ai, logged in, the Projects area.
- **Action to show**: the "Create project" button, and/or the naming screen right after
  clicking it.
- **Highlight**: a box around "Create project."
- **Caption**: "In claude.ai, click your name/menu, then 'Projects', then 'Create
  project'. Name it anything — e.g. 'My Orion'."
- **Alt text**: "The claude.ai interface showing the 'Create project' button and a newly
  named project."

### `docs/img/04-claude-project-upload-files.png`

- **Screen**: inside a claude.ai Project, the settings/knowledge area.
- **Action to show**: the button for adding files (Claude currently calls this "Add
  content" or similar — capture whatever it's actually labelled at the time), ideally
  mid-file-picker with `AGENTS.md` visible/selected.
- **Highlight**: a box around the add-files button.
- **Caption**: "Inside your new Project, find the button to add or upload files (often
  called 'Add content' or 'Knowledge'), then select AGENTS.md from your unzipped folder."
- **Alt text**: "The Project settings screen in claude.ai with the 'Add content' or file
  upload button highlighted, and a file picker open showing AGENTS.md selected."

---

## Priority 2 — nice to have, not yet referenced in README.md (add later if you want deeper visual coverage)

These would help inside `crm/attio/README.md`, `crm/hubspot/README.md`, and
`connectors/connector-checklist.md` — none are blocking the README's own goal, so I didn't
wire placeholder references for these into any file. Say the word if you want me to add
the references once you've decided which of these are worth capturing.

- **Attio → Settings → Developers → API keys**, mid-creation of a new key, with the
  "full data access" / "full configuration access" toggles visible.
- **HubSpot → Settings → Integrations → Private Apps**, the Scopes tab, with the five
  required scopes checked (`crm.schemas.contacts.write`, etc.).
- **n8n**, the blank canvas right after first login, and separately, the "Import from
  file" menu item.
- **Gmail Drafts folder**, showing one staged draft — this is the single best "trust me,
  it really does just wait for you" image in the whole repository, worth prioritising if
  you only add one more.
- **`docs/img/05-terminal-press-start.png`** — a terminal in the unzipped folder right
  after running `node start.mjs`, showing the "Orion — Press Start" banner and the
  plain-words machine report. Capture on your own Mac (no account needed, no client
  data on screen — check the folder name in the prompt line before saving). This would
  slot straight into the README's "Press Start" section; the README doesn't reference
  it yet, so add the reference when the image lands.

---

## Format notes for whoever captures these

- PNG, reasonable width (a browser window at ~1280px wide is plenty — no need for full
  4K screenshots).
- Crop tightly to the relevant area; a full-screen grab with a tiny relevant button
  somewhere in it isn't useful at the sizes these will render inline.
- If a real account's screen has other real business data visible (existing contacts,
  deals, emails) that shouldn't go in a public repo, crop or blur it out before saving —
  this applies especially to the Gmail Drafts and CRM screenshots.
