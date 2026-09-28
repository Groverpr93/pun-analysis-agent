# Flash vs Flash-Lite pun analysis (TASK-38)

A side-by-side run of `gemini-flash-latest` (then `gemini-3.8-flash`) and `gemini-3.5-flash-lite` through a local Backend on 2026-09-28, to decide which model `/api/chat` should use. The prompts and scoring rubric were fixed in TASK-38 before any run.

## Setup

- Same code and fixture for both models; only `GEMINI_MODEL` differed. `analyze_pun`'s fixture answers every call with the undetermined result, so each model judged every text and named its senses itself.
- [`record.mjs`](record.mjs) sends the five prompts to `POST /api/chat` (with `APP_CHECK=off`), 30 seconds apart to stay under Flash's 5 requests/min. It saves each completed reply's raw stream as `<model>/<prompt>.stream.txt`, and each failed one as `<model>/<prompt>.failed-<n>.stream.txt`, so a failure never replaces a recording. P5 is sent with P4 and its reply as history.
- `summary.json` lists, per prompt, the model calls its recorded reply took (1, plus 1 per tool turn) and every failed attempt.

## Prompts

All food puns, asked as "Is this a pun? …":

| Id | Kind | Text | Expected |
|---|---|---|---|
| P1 | homographic | Why did the tomato blush? Because it saw the salad dressing. | pun: dressing (sauce / putting on clothes) |
| P2 | homophonic | The baker quit making doughnuts because he was tired of the hole business. | pun: hole / whole |
| P3 | non-pun | I baked sourdough this morning and it has to cool for an hour before slicing. | not a pun |
| P4 | no dictionary pairs it | I'm on a seafood diet: I see food and I eat it. | pun: seafood / see food |
| P5 | follow-up to P4 | Would it still be a pun if I said I'm on a seafood diet because I only eat fish? | no: the "see food" clause carried the second sense |

## Rubric

Each criterion is scored 1–3:

- **Tool use**: 3 = calls `analyze_pun` once on the text in question; 2 = altered text or several calls; 1 = no call.
- **Verdict**: 3 = correct and committed; 2 = correct but hedged; 1 = wrong.
- **Senses**: 3 = both senses and the word(s) carrying them (P3: no invented second sense); 2 = one, or both vaguely; 1 = neither.
- **Explanation**: coherent with the right senses, and grounded in earlier chat history. P1–P4 have no history, so they're scored on coherence alone; P5 on both.
- **Model calls** per question are counted, not scored.

## Results

Scores are tool / verdict / senses / explanation, followed by model calls:

| Prompt | Flash-Lite | Flash |
|---|---|---|
| P1 | 3 / 3 / 3 / 2 · 2 | 3 / 3 / 3 / 3 · 2 |
| P2 | 3 / 3 / 3 / 3 · 2 | 503 on both attempts |
| P3 | 3 / 3 / 3 / 3 · 2 | 3 / 3 / 3 / 3 · 2 |
| P4 | 3 / 3 / 3 / 3 · 2 | 503 on both attempts |
| P5 | 3 / 3 / 3 / 3 · 2 | not run (P4 had no reply) |

- **P1** is the only head-to-head difference. Flash pins the pun on "dressing" and separates the two senses cleanly. Flash-Lite points at the whole phrase "salad dressing", and its first sense describes dressing a salad rather than the sauce.
- **Availability**, recorded as an observation because the rubric was fixed before running: Flash answered 2 of 4 attempted questions. The other two got Gemini's 503 ("model is currently experiencing high demand") on two attempts about 5 minutes apart: three on the first model call, and one (P4's second attempt) on the call after `analyze_pun` returned, so that attempt still spent a request. Flash-Lite answered 5 of 5.

## Decision

Switch production to `gemini-flash-lite-latest`, which served `gemini-3.5-flash-lite` when checked on 2026-09-28. Where both models answered, Flash explained slightly better on one prompt of two. Flash-Lite was never wrong, used the same 2 calls per question, and never failed. Its free tier (15 requests/min, 500/day, against Flash's 5 and 20) also leaves room for testing and the demo. `GEMINI_MODEL` stays, so switching back to Flash, e.g. with billing for the demo (TASK-37), is a deploy setting rather than a code change. A later retry of Flash's P2, P4 and P5 is TASK-41 (low priority).
