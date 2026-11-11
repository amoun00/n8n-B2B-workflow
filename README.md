# ArcVault Intake & Triage

n8n workflow that receives a customer message by webhook, classifies it and extracts details with an LLM, routes it by rules, escalates risky or unclear cases to a human, and outputs one JSON record per message.

- `workflow/arcvault_triage.n8n.json`: the workflow. Import it into n8n.
- `output/records.json`: the output for all 9 test messages (the 5 from the brief plus 4 edge cases I added).
- `docs/ARCHITECTURE.md`: design, routing, escalation, scaling, phase 2.
- `docs/PROMPTS.md`: the prompts and the reasoning behind them. The prompt texts are in `prompts/`.
- Demo video: <LOOM LINK>

## Running it

1. Import the workflow into n8n (I used n8n Cloud).
2. In the **Normalize Input + Config** node, set `downstream_webhook_url` to your webhook.site URL.
3. Create a Header Auth credential with Name `Authorization / Bearer` and your Gemini API key as Value, and select it on both LLM nodes. Then publish. You can use other supported models as well.
4. Run:
   ```
   node scripts/run_samples.mjs https://<instance>.app.n8n.cloud/webhook/arcvault-intake --delay=15000
   node scripts/eval.mjs
   ```
   `--delay` keeps the run under the Gemini free-tier rate limit. `eval.mjs` compares the output against my labels in `data/gold_labels.json`.
