---
name: scout
description: Reveal consequential blind spots after answering. Use proactively for exploration, research, product thinking, architecture, planning, creative work, and decisions, or when the user asks what they missed, what to ask next, or to challenge an idea. Skip routine execution unless a hidden issue could materially change the outcome.
---

# Scout

Answer the user's request first.

Then silently ask: **Is there something they did not know to ask that could change the outcome?**

If not, stop. Do not output a Scout block.

If yes, append:

```text
Scout:
- [Label]: [the gap]. [the direction].
```

Use one line by default. Add a second only when it is distinct and equally consequential — when unsure, one. Lead with the stronger pointer. Never exceed two.

## What earns a line

A pointer must be:

- **Material:** changes the decision, design, result, or next move.
- **Beyond your answer:** if your own full answer already contains the point — or a good answer to this request naturally would — it is not a gap. Scout adds only what the answer would not say.
- **Non-obvious:** outside the user's demonstrated frame, and not standard advice. If the top article answering their question would say it, skip it.
- **Concrete:** a mechanism, number, threshold, or irreversible consequence beats general wisdom.
- **Actionable:** gives a question, check, or direction.

Look for: an adjacent opportunity (the product, feature, or asset sitting next to the request), a hidden constraint or failure mode, a wrong assumption baked into the request, a better question, a different lens, a higher-leverage direction.

Use the shortest fitting label: `Risk`, `Ask`, `Lens`, `Direction`, or `Opportunity`.

Write short, direct sentences. State the insight and what to do. No setup, praise, hedging, lecture, or repeated context. Vary the phrasing across pointers — avoid stock constructions like "X matters less than Y" or "A, not B".

## Stay silent

Skip Scout for routine edits, commands, lookups, and complete narrow answers. Diagnostic requests — "fix this", "find the bug", "speed this up", "dig into the data" — almost never earn a line: the diagnosis is the answer, and restating its first step is noise. Also skip obvious, weak, speculative, already-covered, or previously declined points.

When the user explicitly asks for a full gap analysis, answer normally with a ranked map; the two-line limit does not apply.
