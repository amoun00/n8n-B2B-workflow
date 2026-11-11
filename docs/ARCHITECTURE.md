# Architecture

The architecture workflow takes into consideration that this is a test scenario not a real one. We use mock data and handle each message synchronousely with limited notifications. No real labeled dataset was used for training.

## How it works

```
Webhook (POST) → Normalize + config → LLM: classify & extract → Validate
  → Route & escalate (code) → LLM: summary → Assemble record
  → POST to queue endpoint (webhook.site) → respond with record
```

- **Trigger:** an n8n webhook. Any channel (email parser, form, portal) can post to it. `scripts/run_samples.mjs` plays that role in the demo.
- **LLM:** `gemini-3.5-flash-lite` through Google's OpenAI-compatible endpoint, temperature 0, JSON-schema output. I first used Groq, but it isn't available in my region; because the endpoint is OpenAI-compatible, switching was a config change. I picked flash-lite because its free tier allows about 500 requests per day, against about 20 for the full Flash models, and each ticket needs 2 calls.
- **State:** none between requests. Each record is POSTed to a queue endpoint (webhook.site standing in for Zendesk or Jira) with `?queue=` and `?escalated=`, and is also returned to the caller. n8n's execution log keeps the per-node data.
- **Main design decision:** the LLM only proposes. It reads the text, picks a category, extracts entities and writes the summary. **Code decides** routing, escalation, thresholds and all arithmetic. Business rules should be exact and auditable, and swapping the model shouldn't change them.
- **Failure handling:** each LLM call retries 3 times and then continues. A failed classification becomes an escalated record with a template summary, so nothing is dropped. This was tested for real: a bad API key sent all 9 tickets to human review.

## Routing

| Category | Queue |
|---|---|
| Bug Report | Engineering |
| Incident/Outage | Engineering On-Call (always escalated in practice) |
| Feature Request | Product |
| Billing Issue | Billing |
| Technical Question | Technical Support |

It's a lookup table in code. Each record keeps both `standard_queue` and `destination_queue`, so when a ticket is escalated the reviewer can see where it would have gone and forward it in one step.

## Escalation

A ticket goes to **Escalation - Human Review** if any of these rules fire. Every rule that fires is recorded with its reason.

- **Confidence < 0.70** (from the brief).
- **Outage:** the model says Incident/Outage, **or** the text contains outage words, **or** multiple users are affected and something is "down" or "not loading". This uses two independent signals, so a mislabel by the model alone doesn't miss an outage.
- **Billing error > $500:** I read "billing error" as the **difference** between billed and contracted, not the invoice total. Sample 3 is $1,240 billed against $980 contracted, a $260 error, so it goes to Billing and isn't escalated. The difference is computed in code, never by the model. A disputed charge over $500 with no reference price is escalated, to be safe.
- **Classification failed** (API error or invalid output).
- **Prompt injection** ("ignore previous instructions"): sample X3 tries to downgrade a real outage this way.

## Results and what they don't prove

All 9 messages were routed correctly (57/57 eval checks against my labels). That's a smoke test, not an accuracy number: 9 messages tell you nothing statistically.

The useful finding is that **confidence is badly calibrated**. The model said 0.95–0.98 on almost everything, and 0.85 on X2, which I wrote to be deliberately ambiguous. The 0.70 gate only caught "hello??". The escalations that mattered (outage, $2,400 billing error, injection) all came from the code rules, not from the model's confidence.

## At production scale

- **Reliability:** respond 202 immediately and process through a queue (n8n queue mode or SQS); add idempotency keys so retries don't create duplicates; write to the real helpdesk API with a dead-letter queue.
- **Alerting:** alert on the `classification_failed` rate. The bad-key incident looked like a quiet queue, and nothing flagged it.
- **Confidence:** replace self-reported scores with self-consistency (several samples, measure agreement) or log-probabilities, then tune the threshold on labelled data.
- **Cost and latency:** two sequential LLM calls per ticket. Skip the summary call for non-escalated tickets, or merge it into the first call. Use a small model first and a larger one only for unclear cases.
- **Privacy:** the free tier may use inputs for training, which rules it out for real customer data. Redact personal data before the LLM call, or use a paid tier.

## Phase 2

1. Build a labelled set of 200+ real tickets, run the eval on every prompt change, and feed human re-routes back into it as new labels.
2. Look up the account by ID: verify the contract rate on billing tickets, and link outage reports to an open incident.
3. Group multiple outage reports into one incident and page on-call once.
4. Secondary notifications: sample 4 (Okta SSO, "evaluating") is also a sales signal.
