/**
 * Send Risk (spec 007, K16): every message is scored 0 to 100, the client sets one
 * level, and a message inside the level sends on its own. These tests drive the
 * things the agent itself drives: the scheduler's allowlist, and the send
 * script's command line on a scratch harness.
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
import { unattendedRunner, WAITING_SENTENCE } from '../status/shapes.mjs';
import { plainEnv } from './helpers/env.mjs';
import { jobSheetTools, jobSheetCrmWrite, jobSheetSendRisk, allowedTools, SHIFT_TOOLS } from '../status/schedule.mjs';
import { dontAsk, GMAIL_SEND, GMAIL_REPLY, GMAIL_FORWARD, GMAIL_DRAFT, GMAIL_SEARCH, SLACK_SEND, SLACK_DRAFT, HUBSPOT_WRITE } from './helpers/dont-ask.mjs';

const sheet = ({ tools, sendRisk } = {}) => `---
name: follow-up
tools: ${tools ?? `Read, ${GMAIL_SEARCH}, ${GMAIL_DRAFT}, ${GMAIL_SEND}, ${GMAIL_REPLY}, ${SLACK_SEND}, ${HUBSPOT_WRITE}`}
go_live: true
crm_write: standing${sendRisk === undefined ? '' : `\nsend_risk: ${sendRisk}`}
schedule: "weekdays 07:00 local"
---
# Follow-up
`;

function shiftTools(text, level) {
  const runner = unattendedRunner('claude-code', {
    tools: allowedTools(jobSheetTools(text), { crmWrite: jobSheetCrmWrite(text), sendRisk: level }),
  });
  return runner.args[runner.args.indexOf('--allowedTools') + 1];
}

// ── Seam 2: the unattended allowlist follows the level ───────────────────────

test('at a level that sends, the job sheet\'s send tools pass through by their real names, and a draft tool was never in question', () => {
  for (const level of ['low', 'medium', 'high']) {
    const tools = shiftTools(sheet(), level);
    for (const t of [GMAIL_SEND, GMAIL_REPLY, SLACK_SEND, GMAIL_DRAFT, GMAIL_SEARCH, HUBSPOT_WRITE]) {
      assert.equal(dontAsk(tools, t), 'runs', `${t} at ${level}`);
    }
    assert.equal(dontAsk(tools, 'Bash', 'node status/send.mjs score --agent follow-up --channel email'), 'runs', 'the shift can score its messages');
  }
});

test('with the level off, every send tool is filtered out and the rest of the sheet stands', () => {
  const tools = shiftTools(sheet(), 'off');
  for (const t of [GMAIL_SEND, GMAIL_REPLY, GMAIL_FORWARD, SLACK_SEND]) assert.equal(dontAsk(tools, t), 'refused', t);
  for (const t of [GMAIL_DRAFT, GMAIL_SEARCH, HUBSPOT_WRITE]) assert.equal(dontAsk(tools, t), 'runs', t);
  assert.equal(dontAsk(tools, SLACK_DRAFT), 'refused', 'a tool the sheet never named is never added');
});

test('a role whose line says never is filtered the same way, whatever the harness level', () => {
  assert.equal(jobSheetSendRisk(sheet({ sendRisk: 'never' })), 'never');
  const tools = shiftTools(sheet(), 'never');
  assert.equal(dontAsk(tools, GMAIL_SEND), 'refused');
  assert.equal(dontAsk(tools, GMAIL_DRAFT), 'runs');
});

test('the scheduler never adds a send tool the sheet does not name', () => {
  const tools = shiftTools(sheet({ tools: `Read, ${GMAIL_SEARCH}` }), 'high');
  for (const t of [GMAIL_SEND, GMAIL_REPLY, GMAIL_FORWARD, SLACK_SEND, SLACK_DRAFT]) assert.equal(dontAsk(tools, t), 'refused', t);
  assert.ok(!SHIFT_TOOLS.some((t) => /send_message|reply|forward/i.test(t)));
});

test('the role line is read the way people write it, and fails closed', () => {
  for (const [value, want] of [[undefined, 'harness'], ['harness', 'harness'], ['"harness"', 'harness'], ['with the harness', 'harness'], ['on', 'harness'], ['never', 'never'], ['off', 'never'], ['no', 'never'], ['staged', 'never'], ['Harness # since hire', 'harness'], ['nevre', 'never']]) {
    assert.equal(jobSheetSendRisk(sheet({ sendRisk: value })), want, String(value));
  }
});

// ── Seam 1: the send script's command line on a scratch harness ─────────────

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** A harness folder with the real scripts in it, one level, and one hired agent. */
function makeHarness(t, { level = 'low', sheetExtra = '', status = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'orion-send-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'status'));
  mkdirSync(join(dir, '.claude', 'agents'), { recursive: true });
  for (const f of readdirSync(join(ROOT, 'status')).filter((n) => n.endsWith('.mjs'))) {
    copyFileSync(join(ROOT, 'status', f), join(dir, 'status', f));
  }
  const scopes = level === null ? { crm_write: true } : { crm_write: true, send_risk: level, send_risk_set_by: 'Priya', send_risk_set_on: '2026-11-01' };
  writeFileSync(join(dir, 'status', 'status.json'), JSON.stringify({
    template_version: '1.5.0', agent_name: 'Orion', business_name: 'Northwind', client_name: 'Priya',
    scopes, sharing: { status_signal_enabled: false }, ...status,
  }, null, 2));
  writeFileSync(join(dir, '.claude', 'agents', 'follow-up.md'), `---\nname: follow-up\ntools: Read, ${GMAIL_SEARCH}, ${GMAIL_SEND}\ngo_live: true\ncrm_write: standing\n${sheetExtra}---\n# Follow-up\n`);
  const run = (...args) => {
    const r = spawnSync(process.execPath, [join(dir, 'status', 'send.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: plainEnv() });
    return { code: r.status, out: r.stdout + r.stderr };
  };
  const log = () => (existsSync(join(dir, 'status', 'send-log.md')) ? readFileSync(join(dir, 'status', 'send-log.md'), 'utf8') : '');
  const statusJson = () => JSON.parse(readFileSync(join(dir, 'status', 'status.json'), 'utf8'));
  return { dir, run, log, statusJson };
}

const score = (h, { relationship = 'reply', content = 'logistics', channel = 'email', more = [] } = {}) =>
  h.run('score', '--agent', 'follow-up', '--to', 'priya@northwind.example', '--channel', channel, '--relationship', relationship, '--content', content, ...more);

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
    if (decision === 'waiting') assert.ok(out.includes(WAITING_SENTENCE), out);
    else assert.ok(!out.includes(WAITING_SENTENCE), out);
    assert.match(h.log(), new RegExp(`\\| follow-up \\| ${message.channel ?? 'email'} \\| ${message.relationship} \\| ${message.content} \\| ${want} \\| ${decision}$`, 'm'), h.log());
    assert.ok(!h.log().includes('northwind.example') && !out.includes('northwind.example'), 'never the recipient');
  }
});

test('above 70 waits whatever the level, and says so', (t) => {
  const h = makeHarness(t, { level: 'high' });
  const { out } = score(h, { relationship: 'cold', content: 'money' });
  assert.match(out, /^Decision: waiting/m);
  assert.match(out, /above 70/i);
  assert.ok(out.includes(WAITING_SENTENCE));
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
  assert.equal(h.run('outcome', 'sent', '--agent', 'follow-up', '--score', '0').code, 0);
  assert.equal(h.run('outcome', 'failed', '--agent', 'follow-up', '--score', '0', '--why', 'the connector refused the send').code, 0);
  assert.match(h.log(), /\| follow-up \| outcome \| sent \| 0$/m);
  assert.match(h.log(), /\| follow-up \| outcome \| failed \| 0 \| the connector refused the send$/m);
  const r = h.run('outcome', 'exploded', '--agent', 'follow-up', '--score', '0');
  assert.equal(r.code, 1);
  assert.match(r.out, /sent, failed or waiting/);
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
  assert.match(r.out, /^follow-up never sends on its own\. The rest of the harness is still at medium\.$/m);
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

test('set-level re-renders a wired wake-up in place, so the allowlist follows the level with no re-wiring', (t) => {
  const h = makeHarness(t, { level: 'off' });
  const sched = (...args) => spawnSync(process.execPath, [join(h.dir, 'status', 'schedule.mjs'), ...args], { cwd: h.dir, encoding: 'utf8', env: plainEnv() });
  // --bin stands in for the agent software, so the test needs none installed.
  const wired = sched('wire', '--agent', 'follow-up', '--surface', 'claude-code', '--at', '07:00', '--bin', process.execPath);
  assert.equal(wired.status, 0, wired.stdout + wired.stderr);
  const wakeUp = join(h.dir, 'status', 'shifts', process.platform === 'win32' ? 'follow-up.cmd' : 'follow-up.sh');
  const before = readFileSync(wakeUp, 'utf8');
  assert.ok(!before.includes(GMAIL_SEND), 'with the level off, the wired allowlist has no send tool');
  assert.ok(before.includes(GMAIL_SEARCH));
  const r = h.run('set-level', 'low');
  assert.match(r.out, /Re-rendered the wake-up for follow-up/, r.out);
  const after = readFileSync(wakeUp, 'utf8');
  assert.ok(after.includes(GMAIL_SEND), 'the send tool is on the allowlist now');
  assert.ok(after.includes(process.execPath) && after.includes('run the follow-up shift'), 'the rest of the wake-up is as it was');
  const record = JSON.parse(readFileSync(join(h.dir, 'status', 'shifts', 'follow-up.json'), 'utf8'));
  assert.deepEqual([record.agent, record.at, record.send_risk], ['follow-up', '07:00', 'low']);
  h.run('set-level', 'never', '--agent', 'follow-up');
  assert.ok(!readFileSync(wakeUp, 'utf8').includes(GMAIL_SEND), 'a role set apart loses the tool on the next run');
});

// ── Seam 1, continued: migrate on the released trees ─────────────────────────

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
  const tar = execFileSync('git', ['archive', tag], { cwd: ROOT, maxBuffer: 1 << 28 });
  writeFileSync(join(dir, 'tree.tar'), tar);
  execFileSync('tar', ['-xf', join(dir, 'tree.tar'), '-C', dir]);
  rmSync(join(dir, 'tree.tar'));
  for (const f of readdirSync(join(ROOT, 'status')).filter((n) => n.endsWith('.mjs'))) copyFileSync(join(ROOT, 'status', f), join(dir, 'status', f));
  const def = join(dir, 'agent', 'agent-definition.md');
  writeFileSync(def, readFileSync(def, 'utf8').replaceAll('{{CLIENT_NAME}}', 'Priya').replaceAll('{{AGENT_NAME}}', 'Orion').replaceAll('{{CLIENT_BUSINESS}}', 'Northwind'));
  if (hand) writeFileSync(def, hand(readFileSync(def, 'utf8')));
  const status = JSON.parse(readFileSync(join(dir, 'status', 'status.schema-template.json'), 'utf8'));
  Object.assign(status, { template_version: tag.slice(1), business_name: 'Northwind', agent_name: 'Orion', client_name: 'Priya' });
  writeFileSync(join(dir, 'status', 'status.json'), JSON.stringify(status, null, 2));
  // A hired agent, written from that release's hiring template, with the client's own exception.
  mkdirSync(join(dir, '.claude', 'agents'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'agents', 'inbox.md'), `---
name: inbox
description: Use when Priya asks for the morning inbox list. Lists the threads that need her. Lists and drafts only.
tools: Read, ${GMAIL_SEARCH}, ${GMAIL_DRAFT}
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

const RETIRED_RE = /NOTHING SENDS WITHOUT|Never instruct a tool to send|nothing has been sent|Never send anything\. Drafts only|never sent (or written )?automatically|never automatic, live or not|no flip|Nothing sends without|sending stays the client's own act|Everything outbound still stages|never send it\)|STAGED FOR APPROVAL/;

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
