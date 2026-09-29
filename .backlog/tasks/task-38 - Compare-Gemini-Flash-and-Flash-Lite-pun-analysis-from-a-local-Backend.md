---
id: TASK-38
title: Compare Gemini Flash and Flash-Lite pun analysis from a local Backend
status: Done
assignee:
  - '@yaisiel.torres'
created_date: '2026-09-27 20:49'
updated_date: '2026-09-29 10:42'
labels: []
dependencies:
  - TASK-9
references:
  - backend/src/genkit.ts
  - docs/local-setup.md
  - 'https://aistudio.google.com/rate-limit'
  - 'https://ai.google.dev/gemini-api/docs/pricing'
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decided with @yaisiel.torres (2026-09-27): keep the current model (gemini-flash-latest, currently gemini-3.8-flash) for now, and decide from a side-by-side comparison run locally whether to stay on it or switch.

Why it matters: the product is how well Gemini explains puns. That's especially true for llm_fallback, where Gemini supplies the senses itself (TASK-20), and for the undetermined result production returns until TASK-11. Flash-Lite (gemini-3.5-flash-lite) is smaller, so it may explain worse, but its free tier is far roomier: 15 requests/min and 500/day, against Flash's 5 and 20 (AI Studio rate-limit page, 2026-09-27). It's also cheaper on the paid tier ($0.30/$1.50 vs $0.75/$3.75 per 1M tokens; Flash doubles on 2027-01-01). Each pun question costs at least 2 requests since TASK-9. The outcome feeds TASK-37 (demo billing and model pin).

Constraints: run it from a local Backend (pnpm dev, see docs/local-setup.md), not the deployed site, and don't change the production model in this task (superseded 2026-09-28 by @yaisiel.torres: production switches to the chosen model here; see AC #4). Flash's free tier is 20 requests/day per project and shared with the deployed site, so run the Flash half after the daily quota resets, and keep the prompt set small enough to fit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A fixed set of prompts is written down before running: at least one homographic pun, one homophonic pun, one non-pun, one pun no dictionary tier would explain (llm_fallback-style), and one follow-up question in the same conversation
- [x] #2 Each prompt is run through gemini-3.8-flash and gemini-3.5-flash-lite from a local Backend with the same code and fixture, and both full replies are saved (e.g. as recorded /api/chat streams). Amended 2026-09-28 by @yaisiel.torres: Flash's P2/P4/P5 hit Gemini 503s and are deferred to TASK-41; the decision was made on the replies recorded
- [x] #3 The replies are compared on criteria agreed before looking at them: calls analyze_pun when it should, correct verdict, names both senses, clear explanation, and requests used per question. The comparison is recorded in this task
- [x] #4 A decision is recorded (stay on Flash, switch to Flash-Lite, or another model) with its reasons, and TASK-37 is updated to match. Amended 2026-09-28 by @yaisiel.torres: production switches to the chosen model in this task (originally: unchanged by it)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Record the fixed prompt set and 1-3 rubric in this task before any run (below).
2. Add an optional GEMINI_MODEL env override (config.ts -> genkit.ts), default gemini-flash-latest so production is unchanged; test it; document it in backend/.env.example and docs/local-setup.md. TASK-37 reuses it to pin the demo model.
3. Add a small recording script that replays the prompt set against a local Backend (APP_CHECK=off) and saves each raw /api/chat stream plus request count per question.
4. Run Flash-Lite first (roomy quota), then Flash right after the daily quota reset.
5. Score both against the rubric, record the comparison and decision here, update TASK-37.

6. After the decision: switch the production default to gemini-flash-lite-latest in config.ts, keep the override, split the Flash retry into TASK-41.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
PROMPT SET (fixed 2026-09-28, before any run; food domain). Every run goes through the fixture, which answers undetermined, so the model judges each text itself.
P1 homographic: 'Is this a pun? Why did the tomato blush? Because it saw the salad dressing.'  (dressing = sauce / putting on clothes)
P2 homophonic: 'Is this a pun? The baker quit making doughnuts because he was tired of the hole business.'  (hole / whole)
P3 non-pun: 'Is this a pun? I baked sourdough this morning and it has to cool for an hour before slicing.'  (expected: not a pun)
P4 no-dictionary (llm_fallback-style): 'Is this a pun? I'm on a seafood diet: I see food and I eat it.'  (seafood / see food, a multi-word split no dictionary pairs)
P5 follow-up, same conversation as P4, sent with P4 and its reply as history: 'Would it still be a pun if I said I'm on a seafood diet because I only eat fish?'  (expected: no, or at most a weak one; the 'see food and eat it' clause carries the second sense)

RUBRIC (1-3 per criterion, agreed before looking at replies):
- Tool use: 3 = calls analyze_pun exactly once on the text in question; 2 = calls it but with altered text, or more than once; 1 = no call when the prompt asks whether something is a pun.
- Verdict: 3 = correct and committed; 2 = correct but hedged; 1 = wrong.
- Senses: 3 = names both senses and the word(s) carrying them; 2 = one sense, or both only vaguely; 1 = neither. Non-pun P3: 3 = says there's no second sense, without inventing one.
- Clear explanation: coherent with the right senses AND grounded in earlier chat history where there is some (P5). 3 = both; 2 = one; 1 = neither.
- Requests per question: count of model calls (1 + one per tool round-trip). Recorded as a number, not scored; lower is better for quota.

2026-09-28 runs (docs/experiments/task-38/, record.mjs):
- gemini-3.5-flash-lite: all 5 prompts ok, 2 model calls each (10 total).
- gemini-flash-latest: P1, P3 ok (2 calls each). P2 and P4 failed with Gemini 503 'model is currently experiencing high demand' on two attempts ~5 min apart (streams kept as *.attempt-N-503.stream.txt); P5 not run since P4 had no reply. Retries stopped to protect the shared 20/day quota (~8 used).
- Agreed with @yaisiel.torres after the first 503s: availability is added as an observation (not a 1-3 score, since the rubric was fixed before running).

Scores agreed with @yaisiel.torres 2026-09-28 (P1-P4 explanation on coherence alone; P5 grounding = 3). Full table and recordings: docs/experiments/task-38/README.md.
DECISION (@yaisiel.torres, 2026-09-28): switch production to gemini-flash-lite-latest. It served gemini-3.5-flash-lite when checked (generateContent modelVersion, 2026-09-28), the model tested here. Reasons: never wrong or failed across 5/5 questions at 2 calls each; Flash explained slightly better on 1 of 2 comparable prompts but 503'd on 2 of 4; Flash-Lite's free tier (15/min, 500/day) fits testing and the demo. GEMINI_MODEL override kept so the demo can switch back to Flash with billing (TASK-37) as a deploy setting. Lite also supplies its own tool-call ids (call_NNN), so tool-request-refs.ts behaves as before. Flash retry of P2/P4/P5 split off at low priority.

Review: independent adversarial review (subagent) found 6 issues, all fixed and re-reviewed: record.mjs overwrote good recordings on failure and misread cut-off streams (now failed-<n> files, CUT_OFF, ok-check before writing, summary in finally, follow-up only pairs with a same-run reply); summary.json now lists failed attempts; genkit.ts wiring had no test (tests/genkit.test.ts, confirmed failing when hard-coded); stale/corrupted Backlog prose fixed. record.mjs paths exercised against a fake local server; real recordings verified unchanged by shasum. Checks: backend pnpm test 103/103, tsc, biome clean.
Architectural review: not needed. No change to contracts.md, project-spec.md topology, engineering-practices.md isolation/phase order, services, dependencies or deploy targets; none of those docs names the model. GEMINI_MODEL is a backend config value with a production default; the deploy workflow sets no env vars, so a value set on the Cloud Run service survives redeploys.
Docs: local-setup.md and backend/.env.example describe GEMINI_MODEL and the new default (separate docs commit); README.md, project-spec.md and AGENTS.md don't name the model, so no drift.

File names: the failed Flash streams mentioned above as *.attempt-N-503.stream.txt are now <id>.failed-N.stream.txt, which record.mjs writes itself.

2026-09-29: closed. Its decision (production on Flash-Lite) shipped, and the ladder (TASK-43/45) has since superseded DEFAULT_GEMINI_MODEL. The remaining Flash retry, TASK-41, is parked.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Compared gemini-flash-latest (3.8-flash) and gemini-3.5-flash-lite on five fixed food-pun prompts through a local Backend (docs/experiments/task-38/: record.mjs, raw streams, summary.json, README with scores and decision). Flash-Lite answered 5/5 correctly at 2 calls each; Flash explained slightly better on 1 of 2 comparable prompts but hit Gemini 503s on 2 of 4 questions (its P2/P4/P5 retry is TASK-41). Decision (@yaisiel.torres): production switches to gemini-flash-lite-latest via DEFAULT_GEMINI_MODEL in backend/src/config.ts, with a GEMINI_MODEL override kept so the demo can switch back to Flash with billing (TASK-37, updated). Verified with backend tests (103/103, incl. new config and genkit wiring tests), tsc, biome, and record.mjs exercised against a fake server.
<!-- SECTION:FINAL_SUMMARY:END -->
