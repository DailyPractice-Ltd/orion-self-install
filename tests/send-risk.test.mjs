/**
 * Send Risk (spec 007, K16): every message is scored 0 to 100, the client sets one
 * level, and a message inside the level sends on its own. These tests drive the
 * send script's command line on a scratch harness.
 *
 *   node --test tests/send-risk.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { WAITING_SENTENCE, RISK_MATRIX, FACTOR_WORDS, SEND_THRESHOLDS, SEND_CEILING, HISTORY_DAYS, LEVEL_SENDS } from '../status/shapes.mjs';
import { RULE_ONE, RETIRED, retiredRe } from '../status/send.mjs';
import { pathToFileURL } from 'node:url';
import { plainEnv } from './helpers/env.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** A harness folder with the real scripts in it, one level, and one hired agent. */
function makeHarness(t, { level = 'low', sheetExtra = '', status = {}, ai_assistant = 'claude-code' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'orion-send-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'status'));
  const jobRoot = ai_assistant === 'codex' ? 'agents' : '.claude/agents';
  mkdirSync(join(dir, jobRoot), { recursive: true });
  mkdirSync(join(dir, 'update'));
  for (const f of ['manifest.json', 'destination-resolver.mjs']) copyFileSync(join(ROOT, 'update', f), join(dir, 'update', f));
  for (const f of readdirSync(join(ROOT, 'status')).filter((n) => n.endsWith('.mjs'))) {
    copyFileSync(join(ROOT, 'status', f), join(dir, 'status', f));
  }
  const scopes = level === null ? { crm_write: true } : { crm_write: true, send_risk: level, send_risk_set_by: 'Priya', send_risk_set_on: '2026-11-01' };
  writeFileSync(join(dir, 'status', 'status.json'), JSON.stringify({
    template_version: '1.5.0', ai_assistant, agent_name: 'Orion', business_name: 'Northwind', client_name: 'Priya',
    scopes, sharing: { status_signal_enabled:true,bridge_url:'https://bridge.test/api/bridge',harness_id:'11111111-1111-1111-1111-111111111111',install_token:'orion_'+'test'.repeat(6) }, ...status,
  }, null, 2));
  writeFileSync(join(dir, jobRoot, 'follow-up.md'), `---\nname: follow-up\ntools: Read, mcp__claude_ai_Gmail__search_threads, mcp__claude_ai_Gmail__send_message\ngo_live: true\ncrm_write: standing\n${sheetExtra}---\n# Follow-up\n`);
  writeFileSync(join(dir,'fetch.mjs'), `globalThis.fetch=async()=>new Response(JSON.stringify({status:'accepted',harness_id:'11111111-1111-1111-1111-111111111111'}),{status:200});`);
  const run = (...args) => {
    const r = spawnSync(process.execPath, ['--import',join(dir,'fetch.mjs'),join(dir, 'status', 'send.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: plainEnv() });
    return { code: r.status, out: r.stdout + r.stderr };
  };
  const log = () => (existsSync(join(dir, 'status', 'send-log.md')) ? readFileSync(join(dir, 'status', 'send-log.md'), 'utf8') : '');
  const statusJson = () => JSON.parse(readFileSync(join(dir, 'status', 'status.json'), 'utf8'));
  return { dir, run, log, statusJson };
}

const score = (h, { relationship = 'reply', content = 'logistics', channel = 'email', more = [] } = {}) =>
  h.run('score', '--agent', 'follow-up', '--to', 'priya@northwind.example', '--channel', channel, '--relationship', relationship, '--content', content, ...more);

test('Codex send gate reads and changes agents/ job sheets', (t) => {
  const h = makeHarness(t, { ai_assistant: 'codex' });
  assert.equal(h.run('set-level', 'never', '--agent', 'follow-up').code, 0);
  assert.match(readFileSync(join(h.dir, 'agents', 'follow-up.md'), 'utf8'), /send_risk: never/);
  assert.match(score(h).out, /wait|never/i);
});

test('each level sends at its ceiling and waits at the next score up, with the exact sentence', (t) => {
  // Reachable scores from the matrix: 20 (reply + claim), 25 (known + logistics), 45 (known + claim), 50 (cold), 70 (cold + claim), 75 (cold + money).
  const cases = [
    ['low', { relationship: 'reply', content: 'claim' }, 20, 'send'],
    ['low', { relationship: 'known', content: 'logistics' }, 25, 'waiting'],
    ['medium', { relationship: 'known', content: 'claim' }, 45, 'send'],
    ['medium', { relationship: 'cold', content: 'logistics' }, 50, 'waiting'],
    ['high', { relationship: 'cold', content: 'claim' }, 70, 'send'],
    ['high', { relationship: 'cold', content: 'money' }, 75, 'waiting'],
  ];
  for (const [level, message, want, decision] of cases) {
    const h = makeHarness(t, { level });
    const { code, out } = score(h, message);
    assert.equal(code, 0, out);
    assert.match(out, new RegExp(`^Score ${want}\\b`, 'm'), `${level}: ${out}`);
    assert.match(out, new RegExp(`^Decision: ${decision}\\b`, 'm'), `${level} at ${want}: ${out}`);
    if (want > SEND_CEILING) assert.match(out, /above 70/i);
    if (decision === 'waiting') assert.ok(out.includes(WAITING_SENTENCE), out);
    else assert.ok(!out.includes(WAITING_SENTENCE), out);
    assert.match(h.log(), new RegExp(`\\| follow-up \\| ${message.channel ?? 'email'} \\| ${message.relationship} \\| ${message.content} \\| ${want} \\| ${decision}$`, 'm'), h.log());
    assert.ok(!h.log().includes('northwind.example') && !out.includes('northwind.example'), 'never the recipient');
  }
});

test('a waiting message says which level would send it, and what change would', (t) => {
  const h = makeHarness(t, { level: 'low' });
  // known lead 25 + money 25 + dm 10 = 60: high sends it; without the price it is 35, which medium sends.
  const { out } = score(h, { relationship: 'known', content: 'money', channel: 'dm' });
  assert.match(out, /^Score 60\b/m);
  assert.match(out, /Your level is low, which sends up to 20\./);
  assert.match(out, /It would send on its own at high, or at medium without the price\./);
});

test('off and absent wait for everything, even a reply about logistics', (t) => {
  for (const level of ['off', null]) {
    const h = makeHarness(t, { level });
    const { code, out } = score(h);
    assert.equal(code, 0, out);
    assert.match(out, /^Score 0\b/m);
    assert.match(out, /^Decision: waiting/m, out);
    assert.ok(out.includes(WAITING_SENTENCE));
    assert.match(out, level === 'off' ? /paused/i : /no send level/i);
  }
});

test('unknown labels fail closed: a label the script does not know scores as the riskiest of its kind, and the script says so', (t) => {
  const h = makeHarness(t, { level: 'high' });
  const { out } = score(h, { relationship: 'friend', content: 'chat', channel: 'carrier pigeon' });
  // cold 50 + money 25 + whatsapp 20 = 95
  assert.match(out, /^Score 95\b/m, out);
  assert.match(out, /--relationship "friend" is not a label I know, so it counts as cold/);
  assert.match(out, /--content "chat" .* counts as money/);
  assert.match(out, /--channel "carrier pigeon" .* counts as whatsapp/);
  assert.match(out, /^Decision: waiting/m);
});

test('hard stops: no-contact, a follow-up to someone who replied, a cap, a role not live, a role that never sends', (t) => {
  const h = makeHarness(t, { level: 'high' });
  // The no-contact list is permanent and matches a whole address or a whole domain.
  assert.equal(h.run('no-contact', '--add', 'Priya@Northwind.example').code, 0);
  let r = score(h);
  assert.match(r.out, /^Decision: waiting/m, r.out);
  assert.match(r.out, /no-contact list/);
  assert.equal(h.run('no-contact', '--add', 'rival.example').code, 0);
  r = h.run('score', '--agent', 'follow-up', '--to', 'ceo@rival.example', '--channel', 'email', '--relationship', 'reply', '--content', 'logistics');
  assert.match(r.out, /no-contact list/);
  assert.ok(!r.out.includes('rival.example') && !h.log().includes('rival.example'), 'the recipient is never printed or logged');
  const list = readFileSync(join(h.dir, 'status', 'no-contact.md'), 'utf8');
  assert.ok(list.includes('priya@northwind.example') && list.includes('rival.example'));

  const h2 = makeHarness(t, { level: 'high' });
  r = score(h2, { relationship: 'follow-up', more: ['--replied'] });
  assert.match(r.out, /^Decision: waiting/m);
  assert.match(r.out, /replied in this thread/);
  r = score(h2, { relationship: 'reply', more: ['--replied'] });
  assert.match(r.out, /^Decision: send/m, 'a reply to someone who replied is the normal case');
  for (const relationship of ['known', 'cold', 'stranger']) {
    r = score(h2, { relationship, more: ['--replied'] });
    assert.match(r.out, /replied in this thread/, `${relationship} with --replied is a follow-up to someone who answered`);
  }

  // A cap counts today's sends on that channel group from the log.
  const h3 = makeHarness(t, { level: 'high' });
  assert.equal(h3.run('set-level', 'high', '--cap-email', '2').code, 0);
  assert.match(score(h3).out, /^Decision: send/m);
  assert.match(score(h3).out, /^Decision: send/m);
  r = score(h3);
  assert.match(r.out, /^Decision: waiting/m);
  assert.match(r.out, /cap of 2 is reached/);
  assert.match(score(h3, { channel: 'slack' }).out, /^Decision: send/m, 'the cap is per channel group');

  const h4 = makeHarness(t, { level: 'high' });
  writeFileSync(join(h4.dir, '.claude', 'agents', 'follow-up.md'), readFileSync(join(h4.dir, '.claude', 'agents', 'follow-up.md'), 'utf8').replace('go_live: true', 'go_live: false'));
  r = score(h4);
  assert.match(r.out, /^Decision: waiting/m);
  assert.match(r.out, /not live yet/);

  const h5 = makeHarness(t, { level: 'high', sheetExtra: 'send_risk: never\n' });
  r = score(h5);
  assert.match(r.out, /^Decision: waiting/m);
  assert.match(r.out, /never sends on its own/);
});

test('history: the client\'s verdicts on this kind of message move the score for thirty days, and an old one does not', (t) => {
  const h = makeHarness(t, { level: 'low' });
  // reply 0 + information 10 + email 0 = 10, sends at low. A rejection on this kind makes it 30: waiting.
  assert.match(score(h, { content: 'information' }).out, /^Score 10\b[\s\S]*^Decision: send/m);
  assert.equal(h.run('verdict', 'rejected', '--agent', 'follow-up', '--channel', 'email', '--content', 'information', '--score', '10').code, 0);
  let r = score(h, { content: 'information' });
  assert.match(r.out, /^Score 30\b/m, r.out);
  assert.match(r.out, /rejected in the last 30 days \+20/);
  assert.match(r.out, /^Decision: waiting/m);
  // Another kind of message is untouched by that verdict.
  assert.match(score(h, { content: 'logistics' }).out, /^Score 0\b/m);
  assert.match(score(h, { content: 'information', channel: 'slack' }).out, /^Score 20\b/m);
  // An approval is the most recent verdict now: 10 - 10 = 0.
  assert.equal(h.run('verdict', 'approved', '--agent', 'follow-up', '--channel', 'email', '--content', 'information', '--score', '30').code, 0);
  r = score(h, { content: 'information' });
  assert.match(r.out, /^Score 0\b/m, r.out);
  assert.match(r.out, /approved in the last 30 days -10/);
  // A verdict older than the window is forgotten.
  const h2 = makeHarness(t, { level: 'low' });
  writeFileSync(join(h2.dir, 'status', 'send-log.md'), '2026-09-01 09:00 | follow-up | email | reply | information | 10 | verdict | rejected\n');
  assert.match(score(h2, { content: 'information' }).out, /^Score 10\b/m);
  assert.match(h.log(), /\| follow-up \| email \| - \| information \| 10 \| verdict \| rejected$/m, 'a verdict line carries the kind of message and the verdict, never the content');
});

test('outcome records what happened, content-free, and refuses what it does not know', (t) => {
  const h = makeHarness(t, { level: 'low' });
  assert.equal(h.run('outcome', 'sent', '--agent', 'follow-up', '--channel', 'email', '--relationship', 'reply', '--content', 'logistics', '--score', '0').code, 0);
  assert.equal(h.run('outcome', 'failed', '--agent', 'follow-up', '--channel', 'email', '--content', 'logistics', '--score', '0').code, 0);
  // One shape for every line: date | agent | channel | relationship | content | score | what happened.
  assert.match(h.log(), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} \| follow-up \| email \| reply \| logistics \| 0 \| sent$/m, h.log());
  assert.match(h.log(), /\| follow-up \| email \| - \| logistics \| 0 \| failed$/m);
  for (const line of h.log().split('\n').filter(Boolean)) assert.equal(line.split('|').length, 7, `every line has the same seven cells: ${line}`);
  const r = h.run('outcome', 'exploded', '--agent', 'follow-up', '--score', '0');
  assert.equal(r.code, 1);
  assert.match(r.out, /sent, failed or waiting/);
  const why = h.run('outcome', 'failed', '--agent', 'follow-up', '--score', '0', '--why', 'Priya said no to the price');
  assert.equal(why.code, 1, 'free text has no place in a content-free log');
});

test('set-level writes the record, says in one line what now sends, remembers the level through a pause, and sets a role apart', (t) => {
  const h = makeHarness(t, { level: 'low' });
  let r = h.run('set-level', 'medium', '--by', 'Priya');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^Set to medium\. On its own it now sends replies, logistics, and first contact to known leads with standard information\. Money and cold contact still wait for you\.$/m);
  let scopes = h.statusJson().scopes;
  assert.deepEqual([scopes.send_risk, scopes.send_risk_set_by, scopes.crm_write], ['medium', 'Priya', true]);
  assert.match(scopes.send_risk_set_on, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(score(h, { relationship: 'known', content: 'information' }).out, /^Decision: send/m, 'the new level takes effect at once');

  r = h.run('set-level', 'pause');
  assert.match(r.out, /^Sending is paused\. Everything waits for you\. Say 'resume sending' to go back to medium\.$/m);
  assert.equal(h.statusJson().scopes.send_risk, 'off');
  assert.match(score(h).out, /^Decision: waiting/m);
  assert.match(score(h).out, /resume sending/);
  r = h.run('set-level', 'resume');
  assert.match(r.out, /^Set to medium\./m);
  assert.equal(h.statusJson().scopes.send_risk_resume, undefined);

  r = h.run('set-level', 'never', '--agent', 'follow-up');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^follow-up never sends\. The rest of the harness is still at medium\.$/m);
  assert.match(readFileSync(join(h.dir, '.claude', 'agents', 'follow-up.md'), 'utf8'), /^crm_write: standing\nsend_risk: never$/m);
  assert.match(score(h).out, /^Decision: waiting/m);
  r = h.run('set-level', 'harness', '--agent', 'follow-up');
  assert.match(r.out, /^follow-up now sends with the harness, at medium/m);
  assert.match(score(h).out, /^Decision: send/m);
  assert.equal(h.statusJson().scopes.send_risk, 'medium', 'a role line never moves the harness level');

  for (const bad of [['set-level', 'extreme'], ['set-level', 'low', '--agent', 'follow-up'], ['set-level', 'never']]) {
    assert.equal(h.run(...bad).code, 1, bad.join(' '));
  }
});

// ── Migrate on the released trees ─────────────────────────

const haveTag = (tag) => spawnSync('git', ['rev-parse', '--verify', `${tag}^{commit}`], { cwd: ROOT }).status === 0;

/**
 * A released tree, filled in the way a real install fills it: the client's name
 * in the agent definition, a hired agent with one line of the client's own, and
 * a status file from that release (so it has no send level). The scripts are
 * today's, as they are after an update refreshes them.
 */
function releasedHarness(t, tag, { hand = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), `orion-migrate-${tag}-`));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const tar = execFileSync('git', ['archive', tag, '--', 'AGENTS.md', 'agent', 'status', 'update'], { cwd: ROOT, maxBuffer: 1 << 28 });
  writeFileSync(join(dir, 'tree.tar'), tar);
  execFileSync('tar', ['-xf', join(dir, 'tree.tar'), '-C', dir]);
  rmSync(join(dir, 'tree.tar'));
  for (const f of readdirSync(join(ROOT, 'status')).filter((n) => n.endsWith('.mjs'))) copyFileSync(join(ROOT, 'status', f), join(dir, 'status', f));
  mkdirSync(join(dir, 'update'), { recursive: true });
  for (const f of ['manifest.json', 'destination-resolver.mjs']) copyFileSync(join(ROOT, 'update', f), join(dir, 'update', f));
  const def = join(dir, 'agent', 'agent-definition.md');
  writeFileSync(def, readFileSync(def, 'utf8').replaceAll('{{CLIENT_NAME}}', 'Priya').replaceAll('{{AGENT_NAME}}', 'Orion').replaceAll('{{CLIENT_BUSINESS}}', 'Northwind'));
  if (hand) writeFileSync(def, hand(readFileSync(def, 'utf8')));
  const status = JSON.parse(readFileSync(join(dir, 'status', 'status.schema-template.json'), 'utf8'));
  Object.assign(status, { template_version: tag.slice(1), ai_assistant: 'claude-code', business_name: 'Northwind', agent_name: 'Orion', client_name: 'Priya' });
  writeFileSync(join(dir, 'status', 'status.json'), JSON.stringify(status, null, 2));
  // A hired agent, written from that release's hiring template, with the client's own exception.
  mkdirSync(join(dir, '.claude', 'agents'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'agents', 'inbox.md'), `---
name: inbox
description: Use when Priya asks for the morning inbox list. Lists the threads that need her. Lists and drafts only.
tools: Read, mcp__claude_ai_Gmail__search_threads, mcp__claude_ai_Gmail__create_draft
status: hired
go_live: false
crm_write: standing
schedule: "weekdays 07:00 local"
---

# Inbox

## What you must not do
- Never send anything. Drafts only. Sending is always a separate yes.
- Never send anything to a .gov address.
- Never exceed the commitments and pacing limits in knowledge base §7.

## Probation and GO-LIVE
While \`go_live: false\`: read and stage only.
Outbound messages are never automatic, live or not. That rule has no flip.
`);
  const run = (...args) => {
    const r = spawnSync(process.execPath, [join(dir, 'status', 'send.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: plainEnv() });
    return { code: r.status, out: r.stdout + r.stderr };
  };
  const read = (rel) => readFileSync(join(dir, rel), 'utf8');
  return { dir, run, read };
}

const RETIRED_RE = /NOTHING SENDS WITHOUT|Never instruct a tool to send|nothing has been sent|Never send anything\. Drafts only|never sent (or written )?automatically|never automatic, live or not|That rule has no flip|Nothing sends without (an explicit yes|explicit approval)|sending stays the client's own act|Everything outbound still stages|never send it\)|STAGED FOR APPROVAL/;

for (const tag of ['v1.3.0', 'v1.4.0']) {
  test(`migrate on a ${tag} harness: the kit's old sentences go, the client's own line stays and is named, the level is written, and running it twice changes nothing`, (t) => {
    if (!haveTag(tag)) return t.skip(`${tag} not fetched`);
    const h = releasedHarness(t, tag);
    const before = Object.fromEntries(['agent/agent-definition.md', 'AGENTS.md', 'agent/adapters/claude-code.md', 'agent/adapters/claude.md', 'agent/adapters/codex.md', 'agent/adapters/chatgpt.md', 'agent/adapters/copilot.md', '.claude/agents/inbox.md'].map((f) => [f, h.read(f)]));
    const flat = (text) => text.replace(/\s+/g, ' ');
    for (const [f, text] of Object.entries(before)) assert.match(flat(text), RETIRED_RE, `${f} should carry the old rule before`);

    const r = h.run('migrate');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /Your harness now sends on its own at low: replies and logistics\. The old rule that nothing sends without your yes has gone from 8 files; the backup is in the folder\. Say 'set my risk to medium' or 'pause sending' to change it\./, r.out);
    assert.match(r.out, /\.claude\/agents\/inbox\.md:\d+\s+- Never send anything to a \.gov address\./, 'the client\'s own line is named');

    const def = h.read('agent/agent-definition.md');
    assert.doesNotMatch(flat(def), RETIRED_RE);
    assert.ok(def.includes("1. SEND INSIDE Priya'S RISK LEVEL"), def.slice(0, 400));
    assert.ok(def.replace(/\s+/g, ' ').includes(WAITING_SENTENCE), 'the exact sentence is in rule 1');
    assert.match(def, /CRM WRITES NEED NO YES/, 'the CRM paragraph is there on both trees');
    assert.match(def, /--agent Orion/, 'the agent\'s own name went into the command');
    assert.match(def, /5\. STAY IN YOUR LANE\. You draft, research, summarise, and send inside Priya's risk/);
    assert.equal((def.match(/\{\{/g) || []).length, (before['agent/agent-definition.md'].match(/\{\{/g) || []).length, 'no placeholder came back');
    for (const f of ['AGENTS.md', 'agent/adapters/claude-code.md', 'agent/adapters/claude.md', 'agent/adapters/codex.md', 'agent/adapters/chatgpt.md', 'agent/adapters/copilot.md']) {
      assert.doesNotMatch(flat(h.read(f)), RETIRED_RE, f);
      assert.match(h.read(f), /rule 1/, `${f} points at rule 1`);
    }
    const sheet = h.read('.claude/agents/inbox.md');
    assert.doesNotMatch(flat(sheet), RETIRED_RE);
    assert.match(sheet, /^- Never send anything to a \.gov address\.$/m, 'the client\'s own line is untouched');
    assert.match(sheet, /^- Never exceed the commitments/m);
    assert.match(sheet, /^- Send only what rule 1 of the agent definition allows/m);
    assert.match(sheet, /^description: Use when Priya asks for the morning inbox list\. Lists the threads that need her\. Sends inside the risk level\.$/m);

    // The backup holds every file as it was.
    const backup = r.out.match(/Backup: (\S+)/)?.[1];
    assert.ok(backup, r.out);
    for (const [f, text] of Object.entries(before)) assert.equal(readFileSync(join(h.dir, backup, f), 'utf8'), text, `${f} in the backup`);

    const scopes = JSON.parse(h.read('status/status.json')).scopes;
    assert.deepEqual([scopes.send_risk, scopes.send_risk_set_by], ['low', 'update']);
    assert.equal(scopes.crm_write, true);

    // Twice is nothing.
    const after = Object.fromEntries(Object.keys(before).map((f) => [f, h.read(f)]));
    const again = h.run('migrate');
    assert.equal(again.code, 0, again.out);
    assert.match(again.out, /Nothing to change/);
    for (const f of Object.keys(before)) assert.equal(h.read(f), after[f], `${f} changed on the second run`);
    assert.equal(JSON.parse(h.read('status/status.json')).scopes.send_risk, 'low');
  });
}

test('a hand-edited old rule is residue: migrate names it and leaves it, and set-level refuses until it is gone', (t) => {
  if (!haveTag('v1.4.0')) return t.skip('v1.4.0 not fetched');
  const h = releasedHarness(t, 'v1.4.0', { hand: (text) => text.replace("1. NOTHING SENDS WITHOUT Priya'S YES. Every outreach message and every other", "1. NOTHING SENDS WITHOUT Priya'S YES, EVER. Every outreach message and every other") });
  const r = h.run('migrate');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /not a wording this script knows[\s\S]*agent\/agent-definition\.md:\d+\s+1\. NOTHING SENDS WITHOUT Priya'S YES, EVER\./, r.out);
  assert.match(h.read('agent/agent-definition.md'), /NOTHING SENDS WITHOUT Priya'S YES, EVER/, 'left alone');
  const set = h.run('set-level', 'medium');
  assert.equal(set.code, 1, set.out);
  assert.match(set.out, /agent\/agent-definition\.md:\d+/);
  assert.match(set.out, /node status\/send\.mjs migrate/);
  assert.equal(JSON.parse(h.read('status/status.json')).scopes.send_risk, 'low', 'the level did not move');
});

// ── Seam 3: the prose is an enforcement point, so it is held to the code ─────

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const squash = (text) => text.replace(/\s+/g, ' ').trim();

test('tripwire: the plain-words matrix is the matrix in shapes.mjs, row for row', () => {
  const doc = read('agent/risk-matrix.md');
  const section = (heading) => {
    const start = doc.indexOf(`\n## ${heading}\n`);
    assert.ok(start !== -1, `agent/risk-matrix.md should have a "## ${heading}" section`);
    const end = doc.indexOf('\n## ', start + 1);
    return doc.slice(start, end === -1 ? undefined : end);
  };
  const rows = (text) => [...text.matchAll(/^\| (.+?) \| `([a-z-]+)` \| ([+-]?\d+) \|$/gm)].map((m) => [m[2], Number(m[3]), m[1]]);
  for (const [heading, kind] of [['Who it is to', 'relationship'], ['What it says', 'content'], ['Where it goes', 'channel']]) {
    const got = rows(section(heading));
    assert.deepEqual(got.map(([label, points]) => [label, points]), Object.entries(RISK_MATRIX[kind]), heading);
    for (const [label, , words] of got) assert.equal(words, FACTOR_WORDS[kind][label], `${kind}.${label} in words`);
  }
  const history = rows(section('What you decided before, and who they are'));
  assert.deepEqual(history.map(([label, points]) => [label, points]), [...Object.entries(RISK_MATRIX.history), ['customer', RISK_MATRIX.customer]]);
  assert.match(doc, new RegExp(`last ${HISTORY_DAYS} days`));
  assert.match(doc, new RegExp(`Low sends up to ${SEND_THRESHOLDS.low}, medium up to ${SEND_THRESHOLDS.medium}, high up to ${SEND_THRESHOLDS.high}\\. Above ${SEND_CEILING} always waits`));
  for (const level of ['low', 'medium', 'high']) assert.ok(doc.includes(LEVEL_SENDS[level]), `the words for ${level}`);
  assert.ok(doc.includes(WAITING_SENTENCE));
});

test('tripwire: rule 1 of the agent definition is the rule migrate writes, and carries the waiting sentence word for word', () => {
  const def = read('agent/agent-definition.md');
  assert.ok(squash(def).includes(squash(RULE_ONE)), 'rule 1 in the template should be RULE_ONE from status/send.mjs');
  assert.ok(squash(def).includes(WAITING_SENTENCE));
  assert.match(def, /CRM WRITES NEED NO YES/);
  assert.match(def, /1\. SEND INSIDE \{\{CLIENT_NAME\}\}'S RISK LEVEL, NEVER ABOVE IT\./);
});

test('tripwire: every template carries the words migrate writes into a kept file, so a migrated folder reads like a fresh one', () => {
  for (const [where, oldWords, newWords] of RETIRED) {
    if (where.endsWith('*.md') || !existsSync(join(ROOT, where)) ||
        ['AGENTS.md', 'agent/adapters/claude-code.md', 'agent/adapters/codex.md', 'agent/adapters/claude.md', 'agent/adapters/chatgpt.md', 'agent/adapters/copilot.md'].includes(where)) continue;
    // Migration still patches older customized prompts in place. Fresh prompts
    // route these task bodies to skills that apply the shared rule at run time.
    if (where === 'agent/agent-definition.md' &&
        /^(Label the draft clearly|\(b\) CRM Update|\(c\) Follow-up Draft)/.test(oldWords)) continue;
    const shipped = spawnSync('git', ['show', `v1.4.1:${where}`], { cwd: ROOT, encoding: 'utf8' });
    if (shipped.status !== 0) continue;
    if (!retiredRe(oldWords).test(shipped.stdout)) continue; // an older wording, already gone from the template
    assert.ok(squash(read(where)).includes(squash(newWords)), `${where} should carry: ${newWords.slice(0, 60)}`);
  }
  const definition = read('agent/agent-definition.md');
  for (const slug of ['prospect-research-outreach', 'post-call-debrief']) {
    assert.ok(definition.includes(`${slug}/SKILL.md`));
    assert.match(read(`plugins/orion/skills/${slug}/SKILL.md`), /rule 1/);
  }
});

test('the status template and wizard default to low, and the update prompts call the migration', (t) => {
  const template = JSON.parse(read('status/status.schema-template.json'));
  assert.equal(template.scopes.send_risk, 'low');
  const manifest = JSON.parse(read('update/manifest.json'));
  for (const f of ['status/send.mjs', 'agent/risk-matrix.md']) assert.ok(manifest.deployment.common_sources.includes(f), `${f} in the deployment`);
  const never = Object.keys(manifest.never_touch).join(' ');
  assert.match(never, /status\/send-log\.md/);
  assert.match(never, /status\/no-contact\.md/);
  assert.match(read('docs/updating.md'), /node status\/send\.mjs migrate/);
  assert.match(read('AGENTS.md'), /filled in before 1\.5\.0/);

  // A fresh install: the wizard writes low, by the install, today.
  const dir = mkdtempSync(join(tmpdir(), 'orion-wizard-level-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'status'));
  copyFileSync(join(ROOT, 'start.mjs'), join(dir, 'start.mjs'));
  for (const f of ['shapes.mjs', 'guard.mjs', 'store.mjs', 'report.mjs', 'status.schema-template.json']) copyFileSync(join(ROOT, 'status', f), join(dir, 'status', f));
  const noNetwork = join(dir, 'no-network.mjs');
  writeFileSync(noNetwork, 'globalThis.fetch = async () => { throw new Error("the wizard must not dial out in this test"); };');
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(noNetwork).href, join(dir, 'start.mjs'), '--checkins', 'no'], { encoding: 'utf8', input: '', cwd: dir });
  assert.equal(r.status, 2, r.stderr);
  assert.doesNotMatch(r.stdout, /Step 3 of 3|Read AGENTS.md and/);
  const scopes = JSON.parse(readFileSync(join(dir, 'status', 'status.json'), 'utf8')).scopes;
  assert.deepEqual([scopes.send_risk, scopes.send_risk_set_by, scopes.crm_write], ['low', 'install', true]);
  assert.match(r.stdout, /Setup is saved but unfinished/);
  // A status file from before the level simply gains low on the next run.
  const old = JSON.parse(readFileSync(join(dir, 'status', 'status.json'), 'utf8'));
  delete old.scopes.send_risk; delete old.scopes.send_risk_set_by;
  writeFileSync(join(dir, 'status', 'status.json'), JSON.stringify(old));
  spawnSync(process.execPath, ['--import', pathToFileURL(noNetwork).href, join(dir, 'start.mjs'), '--checkins', 'no'], { encoding: 'utf8', input: '', cwd: dir });
  assert.equal(JSON.parse(readFileSync(join(dir, 'status', 'status.json'), 'utf8')).scopes.send_risk, 'low');
});

test('tripwire: on a fresh folder migrate has nothing to change and finds no residue, so set-level works at once', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'orion-fresh-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const tar = execFileSync('git', ['archive', 'HEAD', '--', 'AGENTS.md', 'agent', 'status', 'update'], { cwd: ROOT, maxBuffer: 1 << 28 });
  writeFileSync(join(dir, 'tree.tar'), tar);
  execFileSync('tar', ['-xf', join(dir, 'tree.tar'), '-C', dir]);
  // The working tree's own copies, so an uncommitted edit is checked too.
  for (const rel of ['AGENTS.md', 'agent/agent-definition.md', 'agent/adapters/claude-code.md', 'agent/adapters/claude.md', 'agent/adapters/codex.md', 'agent/adapters/chatgpt.md', 'agent/adapters/copilot.md', 'status/send.mjs', 'status/shapes.mjs', 'status/store.mjs', 'update/manifest.json', 'update/destination-resolver.mjs']) copyFileSync(join(ROOT, rel), join(dir, rel));
  copyFileSync(join(dir, 'status', 'status.schema-template.json'), join(dir, 'status', 'status.json'));
  const freshStatus = JSON.parse(readFileSync(join(dir, 'status', 'status.json'), 'utf8'));
  writeFileSync(join(dir, 'status', 'status.json'), JSON.stringify({ ...freshStatus, ai_assistant: 'claude-code' }));
  const run = (...args) => spawnSync(process.execPath, [join(dir, 'status', 'send.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: plainEnv() });
  const m = run('migrate');
  assert.equal(m.status, 0, m.stdout + m.stderr);
  assert.match(m.stdout, /^Nothing to change/m);
  assert.doesNotMatch(m.stdout, /not a wording this script knows/);
  const set = run('set-level', 'medium');
  assert.equal(set.status, 0, set.stdout + set.stderr);
  assert.match(set.stdout, /^Set to medium\./m);
});

test('tripwire: the "waiting for you" words and the route sentences are in the agent definition, word for word', () => {
  const def = squash(read('agent/agent-definition.md'));
  for (const words of [
    "Waiting for you: 3 messages. Say 'send it' and the number, 'send all', or 'no' and the number. Or open a draft, change it and send it yourself; that counts as a yes.",
    'Nothing is waiting for you.',
    '1. Priya at Northwind, email, follow-up with the proposal price, score 55 against low, waiting 2 days, would send at high. Open the draft: <link>',
    'Your Gmail connection can read and draft but not send. Re-authorise Gmail with send permission and the level will take effect.',
    'This assistant cannot send on its own. Every message waits for you here.',
    'status/waiting.md',
    '--cap-email',
  ]) assert.ok(def.includes(words), `the agent definition should carry: ${words}`);
  assert.match(read('agent/risk-matrix.md'), /your own team[^\n]*`reply`/, 'a message to the client\'s own team is a reply: relationship 0, logged like any other');
  for (const a of ['claude-code', 'codex']) assert.match(read(`agent/adapters/${a}.md`), /status\/waiting\.md/, `${a} says where the waiting list lives`);
  const manifest = JSON.parse(read('update/manifest.json'));
  assert.ok(Object.keys(manifest.never_touch).some((k) => k.includes('status/waiting.md')));
});
