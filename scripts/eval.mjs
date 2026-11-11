// Scores output/records.json against human gold labels in data/gold_labels.json.
// Usage: node scripts/eval.mjs
import { readFileSync } from 'node:fs';

const records = JSON.parse(readFileSync(new URL('../output/records.json', import.meta.url), 'utf8'));
const gold = JSON.parse(readFileSync(new URL('../data/gold_labels.json', import.meta.url), 'utf8'));

let checks = 0, passed = 0;
const fails = [];
const check = (id, name, ok, detail) => { checks++; if (ok) passed++; else fails.push(`${id} ${name}: ${detail}`); };

const broken = records.filter(r => !Array.isArray(r.identifiers));
if (broken.length) {
  console.log(`${broken.length} of ${records.length} responses are not valid records, so the workflow failed for them:\n`);
  for (const b of broken) console.log(`  ${b.request_id}: HTTP ${b.http_status ?? '?'} → ${String(b.raw_response ?? JSON.stringify(b)).slice(0, 300)}`);
  console.log('\nOpen n8n → Executions, click the failed run, and look for the node with the red error. Then re-run run_samples.mjs.\n');
}

for (const r of records.filter(r => Array.isArray(r.identifiers))) {
  const id = r.request_id.replace(/^ARC-/, '');
  const g = gold[id];
  if (!g) continue;
  if (g.acceptable_categories) check(id, 'category', g.acceptable_categories.includes(r.category), `got ${r.category}, want ${g.acceptable_categories.join('|')}`);
  if (g.priority) check(id, 'priority', g.priority.includes(r.priority), `got ${r.priority}, want ${g.priority.join('|')}`);
  if (g.escalation_flag !== null) check(id, 'escalation', r.escalation_flag === g.escalation_flag, `got ${r.escalation_flag}`);
  if (g.destination_queue) check(id, 'queue', r.destination_queue === g.destination_queue, `got ${r.destination_queue}, want ${g.destination_queue}`);
  for (const must of g.must_extract) {
    check(id, `extract "${must}"`, r.identifiers.some(i => i.value.includes(must)), `identifiers: ${JSON.stringify(r.identifiers.map(i => i.value))}`);
  }
  if ('billing_discrepancy_usd' in g) check(id, 'billing_discrepancy', r.billing_discrepancy_usd === g.billing_discrepancy_usd, `got ${r.billing_discrepancy_usd}`);
  const sentences = (r.summary.match(/[.!?](\s|$)/g) ?? []).length;
  check(id, 'summary 2-3 sentences', sentences >= 2 && sentences <= 3, `${sentences} sentences`);
  check(id, 'no validation warnings', r.meta.validation_warnings.length === 0, r.meta.validation_warnings.join('; '));
}

if (!checks) process.exit(1);
console.log(`${passed}/${checks} checks passed (${Math.round((100 * passed) / checks)}%)`);
for (const f of fails) console.log('  FAIL', f);
console.log('\nConfidence by record (calibration sanity check):');
for (const r of records.filter(r => Array.isArray(r.identifiers))) console.log(`  ${r.request_id.padEnd(7)} ${String(r.confidence).padEnd(5)} ${r.category}`);
