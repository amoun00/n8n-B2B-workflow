# Prompts

The full prompt texts are in `prompts/`. Both calls use temperature 0 and a JSON schema for the output.

## 1. Classify + extract (`prompts/classify_enrich.system.md`)

Input: the source channel plus the message inside `<message>` tags. Output: category, secondary category, priority, confidence, rationale, core issue, identifiers, money amounts (as billed or expected), impact scope, urgency and the phrases that signal it.

**Why it's built this way.** I combined classification and extraction into one call because both need a full read of the same short text, and two calls would double the cost for no gain. Most of the prompt is spent on **category definitions and tie-breakers**, because the boundaries are where it goes wrong: "dashboard down, multiple users" is an outage rather than a bug, and "is there a way to do SSO?" is a question rather than a feature request. I didn't add few-shot examples: with only five test messages, examples would leak the answers. The message is marked as untrusted data inside tags, to resist injection. The `rationale` field comes before `category` so the model justifies before it labels. The model only *extracts* amounts and never calculates; code does the math. Code also discards any identifier or amount that isn't literally in the message, to catch made-up invoice numbers. **The tradeoff** is that self-reported confidence is weak, and the run confirmed it (0.95–0.98 on nearly everything). With more time I'd measure confidence instead of asking the model for it, and tune the definitions on a real labelled set.

## 2. Team summary (`prompts/summary.system.md`)

Input: a JSON object with the validated fields, the destination queue and the escalation reasons. Output: `{summary}`, 2–3 sentences: what was reported, the impact, and the next action or the escalation reason.

**Why it's built this way.** It's a separate call that runs *after* routing, because the most useful thing for the receiving team is why the ticket is in front of them ("Escalated: possible multi-user outage"), and the first call can't know that. It summarizes checked fields rather than raw text, so it's less likely to introduce a wrong number. **The tradeoff:** a second LLM round-trip per ticket. If it fails, a template summary is used. With more time I'd skip this call for non-escalated tickets and make the summary format depend on the queue (Billing wants amounts first, Engineering wants error codes).

## What went wrong (AI-assisted build, deployed to n8n Cloud)

- **n8n's file node can't create folders**, so the first version would have failed on the first ticket to a new queue. Fixed before deployment.
- **A raw stack trace leaked into the summary** when the LLM call failed. Fixed.
- **Groq is unavailable in my region**, so I switched to Gemini.
- **`gemini-2.5-flash` is retired for new accounts** (404), so I moved to flash-lite.
- **Edited but not published:** n8n kept running the old config until I re-published. The `meta.model` field on each record is what showed it.
- **Invalid API key:** every ticket failed safely to human review, but nothing raised an alert.
- **The fallback summary quoted the whole customer message** and broke the 2–3 sentence rule. The eval script caught it.
