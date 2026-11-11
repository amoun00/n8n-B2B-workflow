// Posts every sample in data/samples.json to the n8n webhook and collects the returned
// records into output/records.json (the Section 4.2 deliverable).
// Usage: node scripts/run_samples.mjs [webhookUrl] [--only=S1,S2,...] [--delay=ms]
// --delay spaces out requests to stay under free-tier rate limits (each request = 2 LLM calls).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const url = process.argv.find(a => a.startsWith('http')) ?? 'http://localhost:5678/webhook/arcvault-intake';
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7).split(',');
const delay = Number(process.argv.find(a => a.startsWith('--delay='))?.slice(8) ?? 0);
const samples = JSON.parse(readFileSync(new URL('../data/samples.json', import.meta.url), 'utf8'))
  .filter(s => !only || only.includes(s.external_id));

const records = [];
for (const s of samples) {
  if (delay && records.length) await new Promise(r => setTimeout(r, delay));
  const t0 = Date.now();
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s) });
  const text = await res.text();
  let rec;
  try { rec = JSON.parse(text); } catch { rec = { request_id: `ARC-${s.external_id}`, http_status: res.status, raw_response: text }; }
  records.push(rec);
  if (!res.ok || rec.raw_response !== undefined || !rec.category && !rec.escalation_flag) {
    console.log(`${s.external_id.padEnd(3)} FAILED  HTTP ${res.status}: ${text.slice(0, 300)}`);
    continue;
  }
  console.log(`${s.external_id.padEnd(3)} ${String(Date.now() - t0).padStart(5)}ms  ${String(rec.category).padEnd(18)} ${String(rec.priority).padEnd(6)} conf=${rec.confidence}  → ${rec.destination_queue}${rec.escalation_flag ? '  [ESCALATED: ' + rec.escalation_reasons.map(r => r.code).join(',') + ']' : ''}`);
}

mkdirSync(new URL('../output/', import.meta.url), { recursive: true });
writeFileSync(new URL('../output/records.json', import.meta.url), JSON.stringify(records, null, 2));
console.log(`\nWrote output/records.json (${records.length} records)`);
