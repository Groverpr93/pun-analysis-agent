# Thinking levels for the ladder's Flash-Lite models (TASK-47)

TASK-45 found that `gemini-3.1-flash-lite` often answers a follow-up by describing an `analyze_pun` result the tool never returned ([`../task-45`](../task-45/README.md)). This compares Gemini's default thinking level with `MEDIUM` on both Flash-Lite models on `/api/chat`'s ladder, to decide each one's level.

## How it's checked

[`compare.mjs`](compare.mjs) runs Backend's own chat flow (`createChatFlow`, with the Inference fixture), once per model and level, each with that one model as its ladder. It runs in-process rather than over HTTP, so each model can be given its own thinking level without changing Backend.

- **Histories:** each model gets the same two recorded first turns from TASK-45's runs, its own and the other Flash-Lite model's. Each has one `analyze_pun` call with the fixture's undetermined result (every field empty), and reply text that names the pun's words and type. The history is the same for every level, so only the level differs.
- **Follow-up:** "What exactly did analyze_pun return for it?", which only the resent result answers.
- **Runs:** 5 per model, level and history, so 40 in all.
- **Timing:** each reply's time to its first non-empty chunk, and to its end.

Replies were graded against a scale fixed before any were read:

- **grounded:** says the tool came back empty or undetermined;
- **misreport:** credits the tool with a verdict, a pun type or the words involved;
- **other:** neither.

Run it from the repo root:

```bash
node --env-file=backend/.env.local docs/experiments/task-47/compare.mjs
```

The run is saved as `runs/<start time>.json`, with every reply.

## Default thinking

Backend sets no thinking level unless `GEMINI_MODEL_CONFIG` gives one. On 2026-09-29, a direct `generateContent` call to `gemini-3.1-flash-lite` reported no thought tokens with no `thinkingConfig`, the same as `MINIMAL`, and 176 thought tokens at `MEDIUM`.

## Results

Run of 2026-09-29 09:20 UTC ([`runs/2026-09-29T09-20-24.439Z.json`](runs/2026-09-29T09-20-24.439Z.json)). Times are over the replies that answered. They include any retries the ladder made after a 503, which the run doesn't record, so the slowest ones (7.1 s and 7.3 s) may be a retry rather than thinking.

| Model | Level | Grounded | Misreport | Other | Median first chunk | Slowest first chunk |
|---|---|---|---|---|---|---|
| `gemini-3.5-flash-lite` | default | 9 | 1 | 0 | 1.7 s | 2.6 s |
| `gemini-3.5-flash-lite` | MEDIUM | 10 | 0 | 0 | 3.7 s | 5.7 s |
| `gemini-3.1-flash-lite` | default | 0 | 8 | 1 | 2.8 s | 7.1 s |
| `gemini-3.1-flash-lite` | MEDIUM | 7 | 2 | 1 | 4.0 s | 7.3 s |

`gemini-3.1-flash-lite` at default had 9 replies, because one failed on 503s through all its retries.

Reply by reply, for anyone checking the grading (the index into `results`). Every reply not listed here was grounded.

- `gemini-3.5-flash-lite`, default: misreport: 34 (the tool "gave me the green light that the text is a pun").
- `gemini-3.1-flash-lite`, default:
  - misreport: 1, 11, 17, 19, 25, 27, 33, 35;
  - other: 3 (the tool "helps me verify the pun" but gave no explanation);
  - failed: 9.
- `gemini-3.1-flash-lite`, MEDIUM:
  - grounded: 5, 7, 15, 23, 29, 31, 37;
  - misreport: 13, 39;
  - other: 21 ("even if the tool's internal notes were brief").

An earlier, unsaved trial with the same design, on `gemini-3.1-flash-lite` only, gave 2 of 10 grounded at default and 9 of 10 at MEDIUM.

## Decision

- **`gemini-3.1-flash-lite` thinks at MEDIUM.** It fixes most of the misreporting (0 of 9 to 7 of 10) for about 1.3 s more before the first chunk. That cost only applies when `gemini-3.5-flash-lite` has failed, since 3.1 is the second rung.
- **`gemini-3.5-flash-lite` stays at its default.** It was right 9 of 10 at its default and 10 of 10 at MEDIUM. One reply isn't worth adding about 2 s to most replies, since 3.5 is the top rung.

Set in `GEMINI_MODEL_CONFIG` ([`backend/src/config.ts`](../../../backend/src/config.ts)). `modelLadder` gives each model's calls only that model's config.

Every follow-up that didn't fail on capacity was answered, so the unsigned resent history also works at MEDIUM, at least with a Gemini-supplied ref, the only kind these histories carry (TASK-45's check ran at the default). Every time to first chunk, at either level, was far below `MODEL_STALL_LIMIT_MS` (30 s). Only follow-ups were timed. A first turn makes two model calls, and at MEDIUM each one thinks.
