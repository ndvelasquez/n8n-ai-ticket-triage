# Security notes

This is a demo with synthetic data, not a hardened product.

- **Unauthenticated webhook.** Fine on `localhost`, not fine on the internet: anyone who can reach it can spend your model quota. Add Header Auth (see README) before exposing it.
- **Ticket text is untrusted.** It is sent to the model as data, not as instructions, and every model output is validated by code. This reduces, and does not remove, prompt-injection risk. Never let this flow act on its own (refunds, replies, account changes).
- **Personal data.** Real tickets contain it. Redact before sending text to any model provider, agree the provider's data handling with the data owner, and set n8n execution retention explicitly.
- **Secrets.** Use n8n credentials. The Slack webhook placeholder in the *Build prompt* node is a demo shortcut; never commit a real URL (CI blocks the common patterns).

Found a problem? Open an issue with steps to reproduce. Do not include real customer data or keys.
