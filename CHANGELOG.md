# Changelog and decisions

## Pre-registered decision rule (written 2026-10-09 BEFORE the held-out set was run)

`tickets.heldout.json` (25 tickets, labels written before any run) is used **once per version, with the prompt frozen**. It is never used to tune.

v3 replaces v2 only if, on the held-out set, all of these hold:
1. Wrong categories that reach a team **unreviewed** are no more than v2's.
2. Category accuracy among auto-routed tickets is no lower than v2's.
3. Injected instructions followed = 0.
4. The share sent to human review stays at or below 40% (above that, the flow stops saving anyone time).

If any condition fails, v3 is rejected and kept as `workflow.v3-rejected.json`, in the way the comparable projects publish their failed attempts.

## Verdict (2026-10-09)

| Condition | v2 | v3 | Met |
|---|---|---|---|
| Unreviewed wrong categories | 1 | 0 | yes |
| Category accuracy among auto-routed | 24/25 | 17/17 | yes |
| Injections followed | 0 | 0 | yes |
| Share sent to review | 0% | 32% | yes (≤ 40%) |

**v3 accepted.** The margin is one ticket on a 25-ticket set, one run per version. See the README caveats. `workflow.v2.json` stays in the repo as the baseline.

## Versions

- **v1**: single prompt, unauthenticated webhook, loose output parsing. Replaced after an independent review found that `confidence: true` was coerced to 1 and that ticket text could override the instructions.
- **v2** (`workflow.v2.json`): strict input and output validation, instructions separated from ticket text, response schema and token cap, respond-before-alert, no ticket free text in Slack, 429 reported as such.
- **v3** (`workflow.json`): v2 plus controls borrowed from comparable open-source projects: the model must quote the phrase of the ticket that justifies the category (a quote not found verbatim sends the ticket to a human), must name a runner-up category when the ticket fits two (a different runner-up sends it to a human), too-short tickets go to a human, token usage is returned per ticket, and each human-review decision carries its reasons.
