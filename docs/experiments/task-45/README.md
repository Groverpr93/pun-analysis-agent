# Chat continuity across the model ladder (TASK-45)

`/api/chat` steps down a ladder of Gemini models when one fails (`GEMINI_MODEL_LADDER` in [`backend/src/config.ts`](../../../backend/src/config.ts)), and it picks the model afresh for each reply. So a follow-up can be answered by a different model than the one that made the earlier reply's `analyze_pun` calls. Frontend resends those calls without their thought signatures ([`contracts.md`](../../contracts.md), "No thought signatures"). This checks that every model on the ladder accepts such a follow-up and answers it.

## How it's checked

[`check.mjs`](check.mjs) starts one local Backend per model on the ladder, each pinned to that model with `GEMINI_MODEL`, with App Check off and the Inference fixture. Then:

1. It asks TASK-38's P4 ("Is this a pun? I'm on a seafood diet: I see food and I eat it.") of each model whose reply gets handed on. Each reply has one `analyze_pun` call.
2. It turns each reply into the contract's parts (text, `tool-call` with its `output`, text), as Frontend does. The parts have no field for thought signatures, so the signatures are left behind.
3. It sends each model a follow-up, "What exactly did analyze_pun return for it?", with a history made by another model: the top model's reply, since the top model answers most replies, or for the top model the second model's. Each follow-up is sent twice, once with the call's Gemini-supplied ref and once with it renumbered `"0"`, the two kinds of ref the contract allows.

A follow-up passes when it's answered. Its reply is saved for reading.

Why one history per model, and not every pair: the history reaches a model unsigned, so that model can't tell which model wrote it. Only whether the receiving model accepts it matters.

Run it from the repo root with `GEMINI_API_KEY` in `backend/.env.local`:

```bash
node docs/experiments/task-45/check.mjs
```

To check just one hand-off, name both models, e.g. the same model twice to compare a model with its own history:

```bash
node docs/experiments/task-45/check.mjs --from gemini-3.1-flash-lite --to gemini-3.1-flash-lite
```

Each run is saved to `runs/<start time>/`: the raw streams under `first-turn/` and `follow-up/`, and `results.json`.

## Runs

All runs used the local key, which is in the `pun-agent` project, like production's. Free-tier quota is per project and model, so a run spends production's quota too, including Flash's 20 requests/day, which production keeps as its last resort.

### 2026-09-28 20:08 UTC: old ladder, every pair

Ladder: `gemini-flash-lite-latest` → `gemini-3.1-flash-lite` → `gemini-2.5-flash-lite`. This run tried every ordered pair and also counted new `analyze_pun` calls.

- `gemini-flash-lite-latest` and `gemini-3.1-flash-lite` accepted each other's history with both refs, and made no new calls.
- `gemini-2.5-flash-lite` failed every request. The recorded streams only show `UNKNOWN`. Backend's console output (not saved) and a direct `generateContent` call showed Gemini's 404 `NOT_FOUND`, "no longer available to new users". In the ladder, a 404 fails the reply outright, so a reply that stepped down to it failed with that 404 instead of the 503 or 429 it stepped down from.

The ladder was changed to `gemini-3.8-flash` → `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite` as a result. Those runs, below, tried every pair and then a neighbour on the ladder, before the design above.

### 2026-09-28 20:23 UTC: new ladder, every pair

- `gemini-3.5-flash-lite` and `gemini-3.1-flash-lite` accepted each other's history: 3.5 with the Gemini ref, and 3.1 with both refs. 3.5's `"0"` follow-up got a 503 through all its retries.
- `gemini-3.8-flash` returned 429 (quota) for its first turn and all its follow-ups.

An earlier attempt with this ladder, whose recordings the next run overwrote, had `gemini-3.8-flash` answer 3 follow-ups: from 3.1 with both refs, and from 3.5 with `"0"`. Its own first turn got a 503 through all its retries. Since those recordings are lost, they aren't counted here.

### 2026-09-29 08:40 UTC: Flash on top, one history per model

Ladder unchanged. Each model got its ladder neighbour's history.

- `gemini-3.5-flash-lite` and `gemini-3.1-flash-lite` answered all four follow-ups, with both refs.
- `gemini-3.8-flash` failed both of its follow-ups after 3 attempts each (4 keepalives in each stream). One ended with `DEADLINE_EXCEEDED`, a stall past the 30 s limit, and the other with `UNAVAILABLE`. A plain "Say hi." sent to it directly right afterwards (not recorded) also got a 503.

The stalls showed a cost of Flash on the top rung. Three 30 s stalls, plus the waits between them, spend about 93 s, more than the reply's 80 s retry budget (`RETRY_BUDGET_MS`), so such a reply fails without stepping down to Flash-Lite. The ladder was changed to `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite` → `gemini-3.8-flash`, and the check to the design above.

### 2026-09-29 08:47 UTC: Flash-Lite on top

Ladder: `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite` → `gemini-3.8-flash`.

- `gemini-3.5-flash-lite` (history from 3.1) and `gemini-3.1-flash-lite` (history from 3.5) answered all four follow-ups, with both refs.
- `gemini-3.8-flash` (history from 3.5) failed both on capacity again: a stall, then 503s, each after 3 attempts.

### 2026-09-29 08:55–08:57 UTC: `gemini-3.1-flash-lite` with its own history

Across the runs above, `gemini-3.1-flash-lite` answered every follow-up, but in 5 of 8 it described a result the tool never returned: "it confirmed … homophonic", with the words and senses from the earlier reply's text. The fixture's actual result is undetermined, with every field empty. That happened with both kinds of ref. `gemini-flash-lite-latest` (2 of 2) and `gemini-3.5-flash-lite` (5 of 5) reported the empty result every time.

To tell whether the hand-off caused it, three runs sent `gemini-3.1-flash-lite` a follow-up to its own reply. Of 5 answered (one got 503s), none reported the empty result: 4 described a verdict the tool never gave, and 1 declined to share the tool's output. So the hand-off doesn't cause it. `gemini-3.1-flash-lite` tends to repeat its earlier reply's text rather than read the resent result, whichever model made the history.

## Result

No model rejected another model's history in any run. Every failure's status was `UNAVAILABLE` (503), `RESOURCE_EXHAUSTED` (429) or `DEADLINE_EXCEEDED` (a stall), plus 2.5's `UNKNOWN` from its 404. A rejected history would be `INVALID_ARGUMENT` (400).

- **`gemini-3.5-flash-lite` and `gemini-3.1-flash-lite`:** verified. Each answers a follow-up to the other's calls, with either kind of ref.
- **`gemini-3.1-flash-lite`'s answers** often misreport what `analyze_pun` returned, with its own history as much as with another model's. That's the model, not the hand-off.
- **`gemini-3.8-flash`:** unverified, because it never answered a request on record. TASK-46 reruns this check for it. It's the last rung, so a follow-up only reaches it after both Flash-Lite models have failed.
