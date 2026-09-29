# Silences of the ladder's Flash-Lite models (TASK-32)

`MODEL_STALL_LIMIT_MS` ([`packages/timeouts/index.js`](../../../packages/timeouts/index.js)) cancels a model call that sends nothing for that long. It was a 30 s guess (TASK-42). This measures how long `/api/chat`'s Flash-Lite models actually go quiet, to check the guess against. `gemini-3.8-flash`, the ladder's last rung, isn't measured here: its free tier is 20 requests a day, shared with production. TASK-50 measures it, and until then the limit isn't lowered (decided with @yaisiel.torres, 2026-09-29).

## How it's measured

[`measure.mjs`](measure.mjs) runs Backend's own chat flow (`createChatFlow`, with the Inference fixture) in-process, once per model with that one model as its ladder, and with the settings production gives it (`GEMINI_MODEL_CONFIG`: `gemini-3.1-flash-lite` thinks at MEDIUM).

- **The stall limit is raised to 120 s during the run.** With production's 30 s, any silence longer than 30 s would be cut off and recorded only as a failure, so the slowest cases, the ones the limit exists for, would never be measured. An attempt that still went quiet for 120 s would be recorded as a stall and reported as a silence of at least 120 s. None did.
- **Each attempt is timed on its own, not the whole reply.** The stall guard times each attempt the ladder makes, so that's the sample. A whole reply's time would also count `analyze_pun`, backoff waits and failed attempts. The ladder is given refs to `timed/<model>` models the script registers, which forward to the real Gemini model and record when the attempt started, when each chunk arrived and when it ended. The ladder, stall guard and config run unchanged around them.
- **Three silences per attempt**, the three the stall guard times: start to first chunk, the longest gap between two chunks, and last chunk to the call ending.
- **Prompts:** TASK-38's five ([`../task-38`](../task-38/README.md)), with P5 sent as a follow-up to that run's own P4 reply, resent the way Frontend resends it. Each of 5 runs sends all five prompts to one model, then to the other (P5 needs that model's own P4), 5 s apart, so a model gets about 10 requests a minute during its turn, under Flash-Lite's 15.
- **Failed attempts** (Gemini's 503s) are counted but aren't samples: they come back at once, so their silence says nothing about the model.

Run it from the repo root, then summarize the saved run:

```bash
node --env-file=backend/.env.local docs/experiments/task-32/measure.mjs
```

```bash
node docs/experiments/task-32/summarize.mjs docs/experiments/task-32/runs/<file>.json
```

## Results

Run of 2026-09-29 10:12 UTC ([`runs/2026-09-29T10-12-09.489Z.json`](runs/2026-09-29T10-12-09.489Z.json)), 50 replies. A "first call" either asks for `analyze_pun` or answers without it (all of 3.5's follow-ups and one of 3.1's did); a call "after tool result" writes the reply; a follow-up's first call also carries P4 and its reply as history. "Attempts" counts the ones that answered.

| Model | Call | Attempts | Median first chunk | Slowest first chunk | Longest gap | Longest tail |
|---|---|---|---|---|---|---|
| `gemini-3.5-flash-lite` | first call | 20 | 0.8 s | 1.3 s | 0.1 s | 0.0 s |
| `gemini-3.5-flash-lite` | after tool result | 20 | 0.6 s | 1.0 s | 0.5 s | 0.0 s |
| `gemini-3.5-flash-lite` | first call (follow-up) | 5 | 0.7 s | 1.0 s | 0.2 s | 0.0 s |
| `gemini-3.1-flash-lite` | first call | 19 | 3.4 s | 7.0 s | 0.0 s | 0.0 s |
| `gemini-3.1-flash-lite` | after tool result | 23 | 2.6 s | 5.1 s | 14.8 s | 0.0 s |
| `gemini-3.1-flash-lite` | first call (follow-up) | 5 | 4.3 s | 6.0 s | 0.1 s | 0.0 s |

| Model | Longest silence of any kind | Failed attempts |
|---|---|---|
| `gemini-3.5-flash-lite` | 1.3 s | none |
| `gemini-3.1-flash-lite` | 14.8 s | 26 UNAVAILABLE |

- **`gemini-3.5-flash-lite`, the top rung, never went quiet for more than 1.3 s.**
- **`gemini-3.1-flash-lite` is slower to start, 2.6–4.3 s at the median.** That fits its MEDIUM thinking, though the stream can't show when it thinks: Backend doesn't ask Gemini for thought summaries (`includeThoughts`), so thinking is silent wherever it happens.
- **The longest silence was mid-reply, not before the first chunk.** In run 3's P5, 3.1's call after the tool result sent two text chunks by 2.7 s, then nothing for 14.8 s, then the rest of a normal, complete reply. So a call can pause after it starts streaming, perhaps to think.
- **3.1 answered 503 to 26 of its 73 attempts.** Run 5's P1 failed on all three, the only failed reply. In production, the ladder could have stepped down to Flash, retry budget permitting.

## Decision

**`MODEL_STALL_LIMIT_MS` stays at 30 s**, about twice the longest silence measured (14.8 s) and four times the slowest first chunk (7.0 s). One mid-reply pause in 47 `gemini-3.1-flash-lite` attempts shows that such pauses happen, not how often or how long they get, so the margin is generous: a 15 s limit would have left that healthy reply 0.2 s to spare. The limit isn't lowered until `gemini-3.8-flash` is measured (TASK-50), since one limit covers every rung, and TASK-45 saw Flash go past 30 s before its first chunk.

What the numbers can't say: 45–47 attempts per model is enough for a median and a worst case seen, not a p99. They come from one run of one prompt set, on the free tier.
