/**
 * K18: a CRM write needs no yes. The standing `crm_write` scope on the job sheet
 * is the one home of the CRM permission, and the unattended runner reads it.
 * These tests run a simulated debrief shift against the tools the wake-up really
 * allows: the note and the task go through with no prompt. Sending has its own
 * level since 1.5.0 (tests/send-risk.test.mjs); here it is simply off.
 *
 *   node --test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { unattendedRunner } from '../status/shapes.mjs';
import { shiftPrompt, jobSheetTools, jobSheetCrmWrite, allowedTools } from '../status/schedule.mjs';
import { dontAsk, GMAIL_SEND, HUBSPOT_WRITE } from './helpers/dont-ask.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const CRM = HUBSPOT_WRITE;
const SEND = GMAIL_SEND;

const sheet = (crm) => `---
name: debrief
tools: Read, ${CRM}, ${SEND}, Bash(node status/done.mjs *)
go_live: false${crm === undefined ? '' : `\ncrm_write: ${crm}`}
schedule: "weekdays 07:00 local"
---
# Debrief
`;

function shiftTools(crm) {
  const text = sheet(crm);
  const runner = unattendedRunner('claude-code', {
    tools: allowedTools(jobSheetTools(text), { crmWrite: jobSheetCrmWrite(text), sendRisk: 'off' }),
  });
  return runner.args[runner.args.indexOf('--allowedTools') + 1];
}

test('standing crm_write: the debrief shift writes its note and task with no prompt, and a send stops when the level is off', () => {
  const tools = shiftTools('standing');
  assert.equal(dontAsk(tools, CRM), 'runs', 'the note and the task are CRM writes and must run');
  assert.equal(dontAsk(tools, SEND), 'refused', 'with the send level off, the send tool on the sheet is filtered out');
  assert.equal(dontAsk(tools, 'Bash', 'node status/done.mjs --agent debrief --tag crm --count 2 --line x'), 'runs');
});

test('crm_write off: the CRM write stages instead of running', () => {
  const tools = shiftTools('off');
  assert.equal(dontAsk(tools, CRM), 'refused');
  assert.equal(dontAsk(tools, SEND), 'refused');
});

test('a job sheet from before the key existed counts as standing', () => {
  assert.equal(jobSheetCrmWrite(sheet(undefined)), 'standing');
  assert.equal(dontAsk(shiftTools(undefined), CRM), 'runs');
});

test('the scope is read in the ways people write it', () => {
  for (const [value, want] of [['standing', 'standing'], ['"standing"', 'standing'], ['off', 'off'], ['false', 'off'], ['staged', 'off'], ['standing # since hire', 'standing'], ['on', 'standing'], ['disabled', 'off'], ['none', 'off'], ['ofF', 'off']]) {
    assert.equal(jobSheetCrmWrite(sheet(value)), want, value);
  }
});

test('the shift prompt does not tell the agent to stage everything, and names the scope', () => {
  const prompt = shiftPrompt({ folder: '/x', name: 'debrief' });
  assert.doesNotMatch(prompt, /Stage everything/);
  assert.match(prompt, /crm_write/);
  assert.match(prompt, /send nothing/);
});

test('the product no longer stages a CRM write for approval', () => {
  const def = read('agent/agent-definition.md');
  assert.doesNotMatch(def, /CRM Update[^\n]*STAGED FOR APPROVAL/);
  assert.doesNotMatch(def, /CRM change, and\s+external communication/);
  assert.match(def, /CRM WRITES NEED NO YES/);
  assert.doesNotMatch(def, /CRM update → `debrief_completed`/);
  assert.match(def, /never covered by\s+the scope/, 'the irreversible list stays, and is read back');
  assert.match(read('AGENTS.md'), /CRM writes need none/);
  assert.match(read('library/HIRING.md'), /crm_write: standing/);
  assert.equal(JSON.parse(read('status/status.schema-template.json')).scopes.crm_write, true);
});
