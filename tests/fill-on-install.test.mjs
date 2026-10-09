/**
 * A library skill is written for any business. As it lands over the radio, the
 * harness fills what the skill lists under "Fill at install" from what it
 * already knows, and leaves the rest for the assistant to ask. These tests pin
 * the list's shape, the one rule that matters (only a listed token is ever
 * touched), and the real radio.mjs doing it.
 *
 *   node --test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFillManifest, fillBundle, SKILL_FILE_MAX } from '../status/shapes.mjs';
import { runRadio } from './helpers/run-radio.mjs';

const SKILL_MD = [
  '---',
  'name: call-planner-control-tower',
  '---',
  '',
  'Plan the day\'s calls for {{CLIENT_BUSINESS}}. Stages in use: {{PIPELINE_STAGES}}.',
  'Open with "Hi {{first_name}}, it is {{AGENT_NAME}} from {{CLIENT_BUSINESS}}."',
  '',
  '## Fill at install',
  '- {{CLIENT_BUSINESS}}: your business name (from: business_name)',
  '- {{AGENT_NAME}}: what your agent is called (from: agent_name)',
  '- {{PIPELINE_STAGES}}: your CRM pipeline stage names, in order',
  '',
  '## Rules',
  '- {{company}} is the prospect\'s company, never {{CLIENT_BUSINESS}}.',
  '',
].join('\n');

const bundle = () => [
  { path: 'SKILL.md', content: SKILL_MD },
  { path: 'references/queue.md', content: '# Queue for {{CLIENT_BUSINESS}}\nCall {{first_name}} at {{company}}.\n' },
  { path: 'templates/ask.json', content: '{"from":"{{CLIENT_BUSINESS}}","to":"{{company}}"}' },
];

test('parseFillManifest: reads the list, in order, and nothing outside it', () => {
  assert.deepEqual(parseFillManifest(SKILL_MD), [
    { token: 'CLIENT_BUSINESS', question: 'your business name', from: 'business_name' },
    { token: 'AGENT_NAME', question: 'what your agent is called', from: 'agent_name' },
    { token: 'PIPELINE_STAGES', question: 'your CRM pipeline stage names, in order', from: null },
  ]);
  // The "Rules" list mentions tokens too; it is not the fill list.
  assert.ok(!parseFillManifest(SKILL_MD).some((m) => m.token === 'company'));
});

test('parseFillManifest: no section, no list; lower-case names are never tokens', () => {
  assert.deepEqual(parseFillManifest('# A skill\n- {{CLIENT_BUSINESS}}: your business name\n'), []);
  assert.deepEqual(parseFillManifest(undefined), []);
  const md = '## Fill at install\r\n- {{company}}: the prospect\r\n- {{CLIENT_BUSINESS}}: your business name (from: business_name)\r\n- {{CLIENT_BUSINESS}}: again\r\n';
  assert.deepEqual(parseFillManifest(md), [
    { token: 'CLIENT_BUSINESS', question: 'your business name', from: 'business_name' },
  ], 'Windows line endings read the same, and a token is listed once');
});

test('fillBundle: what the harness knows goes into every file; only listed tokens are touched', () => {
  const { files, filled, open } = fillBundle(bundle(), { business_name: 'Daily Practice', agent_name: 'Neo' });
  const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));

  assert.match(byPath['SKILL.md'], /calls for Daily Practice\. Stages in use: \{\{PIPELINE_STAGES\}\}\./);
  assert.match(byPath['SKILL.md'], /it is Neo from Daily Practice\./);
  assert.equal(byPath['references/queue.md'], '# Queue for Daily Practice\nCall {{first_name}} at {{company}}.\n');
  assert.deepEqual(JSON.parse(byPath['templates/ask.json']), { from: 'Daily Practice', to: '{{company}}' });

  // The skill's own working text is never filled: it is not on the list.
  assert.match(byPath['SKILL.md'], /Hi \{\{first_name\}\}/);
  const upper = fillBundle(
    [{ path: 'SKILL.md', content: 'From {{CLIENT_BUSINESS}} to {{TEAM_MEMBERS}} about {{DEAL_NAME}}.\n\n## Fill at install\n- {{CLIENT_BUSINESS}}: your business name (from: business_name)\n' }],
    { business_name: 'Daily Practice' },
  ).files[0].content;
  assert.match(upper, /^From Daily Practice to \{\{TEAM_MEMBERS\}\} about \{\{DEAL_NAME\}\}\.$/m, 'an unlisted token in capitals is left alone too');
  assert.match(byPath['SKILL.md'], /- \{\{company\}\} is the prospect's company, never Daily Practice\./);

  assert.deepEqual(filled.map((f) => [f.token, f.value]), [['CLIENT_BUSINESS', 'Daily Practice'], ['AGENT_NAME', 'Neo']]);
  assert.deepEqual(open, [{ token: 'PIPELINE_STAGES', question: 'your CRM pipeline stage names, in order' }]);
});

test('fillBundle: a filled line becomes the record, an open line stays to be asked', () => {
  const { files } = fillBundle(bundle(), { business_name: 'Daily Practice', agent_name: 'Neo' });
  const md = files.find((f) => f.path === 'SKILL.md').content;
  assert.match(md, /^- CLIENT_BUSINESS: Daily Practice$/m);
  assert.match(md, /^- AGENT_NAME: Neo$/m);
  assert.match(md, /^- \{\{PIPELINE_STAGES\}\}: your CRM pipeline stage names, in order$/m);
  assert.ok(!md.includes('{{CLIENT_BUSINESS}}'), 'nothing filled is left in braces');
  assert.ok(!md.includes('{{AGENT_NAME}}'));
});

test('fillBundle: what the harness does not know is left open, never guessed', () => {
  for (const known of [{}, { business_name: null }, { business_name: '   ' }, { business_name: 42 }, undefined]) {
    const { files, filled, open } = fillBundle(bundle(), known);
    assert.deepEqual(filled, []);
    assert.deepEqual(open.map((o) => o.token), ['CLIENT_BUSINESS', 'AGENT_NAME', 'PIPELINE_STAGES']);
    assert.deepEqual(files, bundle(), 'with nothing to fill the skill is exactly as it arrived');
  }
});

test('fillBundle: a skill cannot name a status field of its own choosing', () => {
  const md = '{{SECRET}} {{WHERE}}\n\n## Fill at install\n- {{SECRET}}: a token (from: install_token)\n- {{WHERE}}: a path (from: sharing)\n';
  const { files, filled, open } = fillBundle(
    [{ path: 'SKILL.md', content: md }],
    { business_name: 'Daily Practice', install_token: 'orion_' + 'secret'.repeat(4), sharing: 'x' },
  );
  assert.deepEqual(filled, []);
  assert.deepEqual(open.map((o) => o.token), ['SECRET', 'WHERE']);
  assert.ok(!files[0].content.includes('orion_'), 'the token never reaches a file');
});

test('fillBundle: a skill that lists nothing comes back untouched', () => {
  const plain = [
    { path: 'SKILL.md', content: '# Confirm\nHi {{first_name}}, from {{CLIENT_BUSINESS}}.\n' },
    { path: 'templates/t.json', content: '{"subject":"Confirming {{date}}"}' },
  ];
  const result = fillBundle(plain, { business_name: 'Daily Practice' });
  assert.equal(result.files, plain, 'the very same files, not a copy');
  assert.deepEqual([result.filled, result.open], [[], []]);
});

test('fillBundle: a name is written exactly as it is, and a JSON file still parses', () => {
  const name = 'O\'Brien & "Sons" $& (Pty) Ltd';
  const { files } = fillBundle(bundle(), { business_name: name });
  const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));
  assert.ok(byPath['references/queue.md'].startsWith(`# Queue for ${name}\n`));
  assert.equal(JSON.parse(byPath['templates/ask.json']).from, name);
});

test('fillBundle: a value that is not one plain line is not written', () => {
  for (const bad of ['two\nlines', 'tab\there', 'x'.repeat(201), 'nested {{CLIENT_BUSINESS}}']) {
    const { filled, open } = fillBundle(bundle(), { business_name: bad });
    assert.deepEqual(filled, [], JSON.stringify(bad.slice(0, 20)));
    assert.ok(open.some((o) => o.token === 'CLIENT_BUSINESS'));
  }
});

test('fillBundle: a fill that would push a file over its size cap is not made; the skill lands as it arrived', () => {
  const md = `${'{{CLIENT_BUSINESS}} '.repeat(9000)}\n\n## Fill at install\n- {{CLIENT_BUSINESS}}: your business name (from: business_name)\n`;
  assert.ok(md.length < SKILL_FILE_MAX);
  const arrived = [{ path: 'SKILL.md', content: md }];
  const { files, filled, open } = fillBundle(arrived, { business_name: 'A much longer business name than the token it replaces, by a long way' });
  assert.equal(files, arrived, 'over the cap once filled, so it lands as it arrived');
  assert.deepEqual(filled, []);
  assert.deepEqual(open.map((o) => o.token), ['CLIENT_BUSINESS']);
});

test('fillBundle: Windows line endings survive a fill, line for line', () => {
  const md = 'For {{CLIENT_BUSINESS}}.\r\n\r\n## Fill at install\r\n- {{CLIENT_BUSINESS}}: your business name (from: business_name)\r\n\r\nEnd.\r\n';
  const out = fillBundle([{ path: 'SKILL.md', content: md }], { business_name: 'Daily Practice' }).files[0].content;
  assert.equal(out, 'For Daily Practice.\r\n\r\n## Fill at install\r\n- CLIENT_BUSINESS: Daily Practice\r\n\r\nEnd.\r\n');
});

test('parseFillManifest: the list ends where it ends; a later list is not part of it', () => {
  const md = [
    '## Fill at install',
    'These are filled as the skill lands.',
    '',
    '- {{CLIENT_BUSINESS}}: your business name (from: business_name)',
    '',
    '- {{PIPELINE_STAGES}}: your CRM pipeline stage names, in order',
    '',
    '---',
    '**Blanks filled on every use**',
    '- {{FIRST_NAME}}: the prospect\'s first name (from: business_name)',
    '',
  ].join('\n');
  assert.deepEqual(parseFillManifest(md).map((m) => m.token), ['CLIENT_BUSINESS', 'PIPELINE_STAGES']);
  const { files } = fillBundle([{ path: 'SKILL.md', content: `Hi {{FIRST_NAME}}.\n\n${md}` }], { business_name: 'Daily Practice' });
  assert.match(files[0].content, /^Hi \{\{FIRST_NAME\}\}\.$/m, 'a blank filled on every use is never filled at install');
});

test('parseFillManifest: a heading inside a code block is an example, not the list', () => {
  const md = 'How to write one:\n\n```\n## Fill at install\n- {{EXAMPLE}}: an example (from: business_name)\n```\n\nUse {{EXAMPLE}} like so.\n';
  assert.deepEqual(parseFillManifest(md), []);
  const arrived = [{ path: 'SKILL.md', content: md }];
  assert.equal(fillBundle(arrived, { business_name: 'Daily Practice' }).files, arrived);
});

test('parseFillManifest: near spellings of the heading and the hint still read', () => {
  for (const md of [
    '### Fill at install\n- {{CLIENT_BUSINESS}}: your business name (from: business_name)\n',
    '## Fill at install:\n- {{CLIENT_BUSINESS}}: your business name (From: Business_Name).\n',
    '## FILL AT INSTALL\n* {{CLIENT_BUSINESS}}:your business name   (from:business_name)\n',
  ]) {
    assert.deepEqual(parseFillManifest(md), [{ token: 'CLIENT_BUSINESS', question: 'your business name', from: 'business_name' }], md);
  }
});

test('parseFillManifest: a line a server pads to a great length cannot stall the radio', () => {
  const pad = ' '.repeat(190000);
  const md = `## Fill at install\n- {{A}}: x${pad}y\n- {{CLIENT_BUSINESS}}: your business name (from: business_name)${pad}\n`;
  const started = Date.now();
  const found = parseFillManifest(md);
  assert.ok(Date.now() - started < 2000, 'read in well under two seconds');
  assert.deepEqual(found.map((m) => m.token), ['CLIENT_BUSINESS'], 'the padded line is not a fill line; a trailing pad is only white space');
});

test('fillBundle: a list that names a token twice, or too many of them, is not used at all', () => {
  const twice = '{{CLIENT_BUSINESS}}\n\n## Fill at install\n- {{CLIENT_BUSINESS}}: your business name (from: business_name)\n- {{CLIENT_BUSINESS}}: again\n';
  const a = fillBundle([{ path: 'SKILL.md', content: twice }], { business_name: 'Daily Practice' });
  assert.match(a.problem, /listed twice/);
  assert.equal(a.files[0].content, twice, 'nothing is filled from a list that cannot be trusted');

  const many = `## Fill at install\n${Array.from({ length: 21 }, (_, i) => `- {{T${i}}}: thing ${i}`).join('\n')}\n`;
  assert.match(fillBundle([{ path: 'SKILL.md', content: many }], {}).problem, /more than 20/);
});

test('fillBundle: in YAML and CSV a name is only written where it is safe as it stands', () => {
  const skill = (name) => fillBundle([
    { path: 'SKILL.md', content: '---\nname: outreach\ndescription: Outreach for {{CLIENT_BUSINESS}}\n---\n\nBody for {{CLIENT_BUSINESS}}.\n\n## Fill at install\n- {{CLIENT_BUSINESS}}: your business name (from: business_name)\n' },
  ], { business_name: name });

  // A plain name is fine anywhere, the frontmatter included.
  const plain = skill('Smith & Sons (Pty) Ltd');
  assert.match(plain.files[0].content, /^description: Outreach for Smith & Sons \(Pty\) Ltd$/m);
  assert.deepEqual(plain.open, []);

  // A colon, a comma, a quote or a hash would change what the YAML means: asked, not written.
  for (const name of ['Acme: Plumbing & Heating', 'Smith, Jones & Co', 'Studio #9', 'O\'Brien "Best" Co']) {
    const r = skill(name);
    assert.deepEqual(r.filled, [], name);
    assert.deepEqual(r.open.map((o) => o.token), ['CLIENT_BUSINESS'], name);
    assert.match(r.files[0].content, /Body for \{\{CLIENT_BUSINESS\}\}\./, 'left whole for the assistant, not half filled');
  }

  // The same names are fine in prose, where no file format reads them.
  const prose = fillBundle([
    { path: 'SKILL.md', content: 'For {{CLIENT_BUSINESS}}.\n\n## Fill at install\n- {{CLIENT_BUSINESS}}: your business name (from: business_name)\n' },
    { path: 'references/list.csv', content: 'name,stage\nexample,lead\n' },
    { path: 'agents/openai.yaml', content: 'interface:\n  display_name: Outreach\n' },
  ], { business_name: 'Acme: Plumbing, Heating & "More"' });
  assert.match(prose.files[0].content, /^For Acme: Plumbing, Heating & "More"\.$/m);

  // And a token sitting in a .csv or .yaml file follows the same rule as the frontmatter.
  for (const path of ['references/list.csv', 'agents/openai.yaml']) {
    const r = fillBundle([
      { path: 'SKILL.md', content: '## Fill at install\n- {{CLIENT_BUSINESS}}: your business name (from: business_name)\n' },
      { path, content: 'owner: {{CLIENT_BUSINESS}}\n' },
    ], { business_name: 'Smith, Jones & Co' });
    assert.deepEqual(r.filled, [], path);
  }
});

test('fillBundle: a hint this harness does not honour is taken off the line as it lands', () => {
  const md = 'Key {{SECRET}} for {{CLIENT_BUSINESS}}.\n\n## Fill at install\n- {{CLIENT_BUSINESS}}: your business name (from: business_name)\n- {{SECRET}}: a token (from: install_token)\n';
  const withName = fillBundle([{ path: 'SKILL.md', content: md }], { business_name: 'Daily Practice' });
  assert.match(withName.files[0].content, /^- \{\{SECRET\}\}: a token$/m);
  const without = fillBundle([{ path: 'SKILL.md', content: md }], {});
  assert.match(without.files[0].content, /^- \{\{SECRET\}\}: a token$/m, 'even when nothing else is filled');
  assert.ok(!without.files[0].content.includes('install_token'));
  assert.match(without.files[0].content, /^- \{\{CLIENT_BUSINESS\}\}: your business name \(from: business_name\)$/m, 'a hint it does honour stays');
});

test('fillBundle: a question that names the business is asked with the name in it', () => {
  const md = '## Fill at install\n- {{CLIENT_BUSINESS}}: your business name (from: business_name)\n- {{PIPELINE_STAGES}}: the stage names {{CLIENT_BUSINESS}} uses in its CRM\n';
  const { open } = fillBundle([{ path: 'SKILL.md', content: md }], { business_name: 'Daily Practice' });
  assert.deepEqual(open, [{ token: 'PIPELINE_STAGES', question: 'the stage names Daily Practice uses in its CRM' }]);
});

// ── The real radio.mjs ──────────────────────────────────────────────────────

const REPLY = {
  status: 200,
  body: {
    slug: 'call-planner-control-tower', kind: 'skill', name: 'Call Planner Control Tower', one_liner: 'Plan the day\'s calls.',
    family: null, tools_required: ['CRM'], version: '1.0.0', content_path: null, content_sha: null,
    content: SKILL_MD,
    files: bundle(),
  },
};
const INSTALL = ['library', '--install', 'call-planner-control-tower'];
const KNOWN = { business_name: 'Daily Practice', agent_name: 'Neo' };

test('library --install: the preview says what will be filled and what will be asked, and writes nothing', () => {
  const { code, out, err, trees } = runRadio(INSTALL, { reply: REPLY, status: KNOWN });
  assert.equal(code, 0, err);
  assert.match(out, /Filled in as it lands, so it reads as yours:\n {2}your business name: Daily Practice\n {2}what your agent is called: Neo\n/);
  assert.match(out, /Your AI will ask you, before the skill is used:\n {2}your CRM pipeline stage names, in order\n/);
  assert.match(out, /calls for Daily Practice\./, 'the first lines shown are the ones that will land');
  assert.equal(trees['call-planner-control-tower'], undefined, 'nothing written before the yes');
});

test('library --install --yes: the skill lands as this business\'s, and the open question is handed to the assistant', () => {
  const { code, out, err, trees, calls } = runRadio([...INSTALL, '--yes'], { reply: REPLY, status: KNOWN });
  assert.equal(code, 0, err);
  const tree = trees['call-planner-control-tower'];
  assert.deepEqual(Object.keys(tree), ['SKILL.md', 'references/queue.md', 'templates/ask.json']);
  assert.equal(tree['references/queue.md'], '# Queue for Daily Practice\nCall {{first_name}} at {{company}}.\n');
  assert.deepEqual(JSON.parse(tree['templates/ask.json']), { from: 'Daily Practice', to: '{{company}}' });
  assert.match(tree['SKILL.md'], /^- CLIENT_BUSINESS: Daily Practice$/m);
  assert.match(tree['SKILL.md'], /Stages in use: \{\{PIPELINE_STAGES\}\}\./, 'what it does not know stays for the assistant');

  assert.match(out, /Written: 3 files to \.claude\/skills\/call-planner-control-tower\//);
  assert.match(out, /Filled in: your business name \(Daily Practice\)/);
  const fence = out.slice(out.lastIndexOf('--- for the assistant'));
  assert.match(fence, /\{\{PIPELINE_STAGES\}\}: your CRM pipeline stage names, in order/);
  assert.ok(!fence.includes('{{CLIENT_BUSINESS}}'), 'a filled token is not asked again');
  assert.ok(calls.some((c) => c.path === '/api/bridge/assets'), 'the shelf is told');
});

test('library --install --yes: a harness with no business name on record fills nothing and asks', () => {
  const { code, out, err, trees } = runRadio([...INSTALL, '--yes'], { reply: REPLY });
  assert.equal(code, 0, err);
  assert.deepEqual(trees['call-planner-control-tower'], Object.fromEntries(bundle().map((f) => [f.path, f.content])), 'exactly as it arrived');
  assert.ok(!out.includes('Filled in'));
  const fence = out.slice(out.lastIndexOf('--- for the assistant'));
  for (const t of ['CLIENT_BUSINESS', 'AGENT_NAME', 'PIPELINE_STAGES']) assert.ok(fence.includes(`{{${t}}}`), t);
});

test('library --install --yes: a skill with no fill list lands byte for byte, whatever it has in braces', () => {
  const files = [
    { path: 'SKILL.md', content: '# Meeting Confirmation\nHi {{first_names}}, {{CLIENT_BUSINESS}} confirms {{time}}.\n' },
    { path: 'templates/confirm.json', content: '{"subject":"Confirming {{day}}"}' },
  ];
  const reply = { status: 200, body: { ...REPLY.body, slug: 'meeting-confirmation', content: files[0].content, files } };
  const { code, out, err, trees } = runRadio(['library', '--install', 'meeting-confirmation', '--yes'], { reply, status: KNOWN });
  assert.equal(code, 0, err);
  assert.deepEqual(trees['meeting-confirmation'], Object.fromEntries(files.map((f) => [f.path, f.content])));
  assert.ok(!out.includes('Filled in'));
  assert.ok(!out.includes('not ready until'));
});

test('library --install --yes: an older library that sends only the SKILL.md is filled the same way', () => {
  const legacy = { status: 200, body: { ...REPLY.body, files: undefined } };
  const { code, err, trees } = runRadio([...INSTALL, '--yes'], { reply: legacy, status: KNOWN });
  assert.equal(code, 0, err);
  assert.deepEqual(Object.keys(trees['call-planner-control-tower']), ['SKILL.md']);
  assert.match(trees['call-planner-control-tower']['SKILL.md'], /calls for Daily Practice\./);
});

test('library --install: a bundle whose entry file is not spelled SKILL.md is refused in plain words', () => {
  const reply = { status: 200, body: { ...REPLY.body, files: [{ path: 'skill.md', content: '# lower-case\n' }] } };
  const { code, out, err, trees } = runRadio([...INSTALL, '--yes'], { reply });
  assert.equal(code, 0, err);
  assert.equal(err, '', 'no stack trace');
  assert.match(out, /will not write \(no SKILL\.md\)\. Nothing written\./);
  assert.equal(trees['call-planner-control-tower'], undefined);
});

test('library --install: a skill whose fill list cannot be used is refused, and nothing is written', () => {
  const twice = SKILL_MD.replace('- {{PIPELINE_STAGES}}: your CRM pipeline stage names, in order', '- {{CLIENT_BUSINESS}}: listed again');
  assert.notEqual(twice, SKILL_MD);
  const reply = { status: 200, body: { ...REPLY.body, content: twice, files: [{ path: 'SKILL.md', content: twice }] } };
  const { code, out, err, trees, calls } = runRadio([...INSTALL, '--yes'], { reply, status: KNOWN });
  assert.equal(code, 0, err);
  assert.match(out, /will not write \(\{\{CLIENT_BUSINESS\}\} is listed twice under "Fill at install"\)\. Nothing written\./);
  assert.equal(trees['call-planner-control-tower'], undefined);
  assert.ok(!calls.some((c) => c.path === '/api/bridge/assets'), 'no shelf report on a refusal');
});
