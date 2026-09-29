---
id: TASK-32
title: 'Backend: set analyze_pun''s Inference timeout from a measured cold start'
status: In Progress
assignee:
  - '@yaisiel.torres'
created_date: '2026-09-27 15:25'
updated_date: '2026-09-29 10:32'
labels: []
milestone: m-4
dependencies:
  - TASK-9
  - TASK-14
references:
  - docs/contracts.md
  - backend/src/tools/analyze-pun.ts
project: backend
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-9 added INFERENCE_TIMEOUT_MS (backend/src/tools/analyze-pun.ts) with a provisional, unmeasured 20 s, because Inference wasn't deployed yet (deploy-inference.yml was a placeholder until TASK-14). The value bounds how long a turn waits on analyze_pun before Backend falls back to the undetermined /analyze result, and Frontend relies on it as the worst-case wait (TASK-10 AC #8, TASK-28). Too low and every cold start degrades to 'undetermined'; too high and a dead Inference stalls every pun question. Carries TASK-9's AC #5, which stayed open.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Inference's cold start on Cloud Run is measured on the deployed service (time to first successful /analyze after scale-to-zero), over several runs, with the method recorded
- [ ] #2 INFERENCE_TIMEOUT_MS is set from that measurement with its margin explained next to the constant
- [ ] #3 docs/contracts.md records the measured value and drops the 'provisional and unmeasured' wording, and updates the maximum silence between /api/chat events (MODEL_STALL_LIMIT_MS + INFERENCE_TIMEOUT_MS) that Frontend's limit (TASK-28) is set against
- [x] #4 MODEL_STALL_LIMIT_MS (packages/timeouts/index.js) is checked against measured Gemini silences (time to first chunk, longest gap between chunks, last chunk to call end), per model call, over TASK-38's prompt set, for the ladder's Flash-Lite models (gemini-3.5-flash-lite, gemini-3.1-flash-lite) with the settings production gives them; the measurement and method are recorded, and the value is not lowered below 30 s until gemini-3.8-flash is measured too (follow-up task). Amended 2026-09-29 by @yaisiel.torres: was every model production can run.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
AC #1-#3 wait on TASK-16 (/analyze raises NotImplementedError; a cold start that skips spaCy/WordNet loading would under-measure). AC #4 now, Flash-Lite only (decided with @yaisiel.torres 2026-09-29):
1. Harness docs/experiments/task-32/measure.mjs: runs Backend's own chat flow in-process (createChatFlow + fixture analyze_pun), like TASK-47's compare.mjs, one Flash-Lite model per ladder.
2. Stall limit raised to 120 s during measurement, so slow silences are observed rather than censored at 30 s; any call that hits 120 s is recorded as a stall.
3. Each ladder attempt timed on its own: the ladder gets refs to harness-registered timed/<model> models (carrying GEMINI_MODEL_CONFIG) that forward to the real model and timestamp start, each chunk, and end. Samples tagged by model, prompt and position in the reply; failed attempts counted but kept out of the silence stats.
4. TASK-38's P1-P5 (P5 as a follow-up on P4's recorded reply), several runs per model within Flash-Lite's 15 requests/min.
5. README with method, results and the margin reasoning; MODEL_STALL_LIMIT_MS's comment and docs/contracts.md cite the Flash-Lite numbers; the value stays at 30 s until Flash is measured.
6. Follow-up task for measuring gemini-3.8-flash; inform TASK-28, TASK-37 and TASK-43/45 with the results.
7. Code review + architectural review subagents; docs drift check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Carries TASK-9's former AC #5, removed from TASK-9 on 2026-09-27: 'The Inference timeout is a named constant whose value is based on a measured Inference cold start on Cloud Run ... and the value and measurement are recorded in docs/contracts.md so Frontend can rely on the worst-case wait.' The constant already exists (INFERENCE_TIMEOUT_MS, backend/src/tools/analyze-pun.ts); contracts.md also states the per-reply worst case (up to 5 rounds x the timeout), which must be updated with the measured value.

From TASK-14's architectural review (2026-09-28): AC #1 measures time to the first successful /analyze, but /analyze answers 500 (NotImplementedError) until TASK-16, and the dominant cold-start cost (spaCy/WordNet loads, and torch if TASK-19 adds sentence-transformers) only appears once the real model runs. So this effectively depends on TASK-16, and should be re-measured if TASK-19 changes the model. The service is IAM-private: measuring needs roles/run.invoker (or project admin) and an ID token, e.g. `curl -H "Authorization: Bearer $(gcloud auth print-identity-token)" <url>/analyze`.

2026-09-28: MODEL_STALL_LIMIT_MS was added to this task at the user's request when TASK-42 set it provisionally. Measuring it doesn't need Inference (a local Backend with APP_CHECK=off, as in TASK-38, is enough), so it needn't wait for TASK-16 like the cold-start measurement does.

2026-09-28 (TASK-42 architectural review): Frontend no longer relies on the per-reply Inference total (5 rounds x INFERENCE_TIMEOUT_MS) as its worst-case wait; it relies on the maximum silence between events in docs/contracts.md. AC #3 was reworded to match, and AC #4 widened from 'TASK-43's ladder' to every model production can run, since GEMINI_MODEL is configurable and -latest aliases move.

2026-09-28 (TASK-44): MODEL_STALL_LIMIT_MS (30 s), INFERENCE_TIMEOUT_MS (20 s) and MAX_TOOL_ROUNDS (3, was Genkit's implicit 5) now live in packages/timeouts/index.js (@pun-agent/timeouts), not stall-guard.ts or analyze-pun.ts, and its tests check they still fit together. Headroom is small: with 3 rounds and Cloud Run's timeout at 400 s, the retry budget still fits one retry only while the stall limit stays at or below 35 s. A measured value above that must raise CLOUD_RUN_REQUEST_TIMEOUT_MS in the same change (safe in one deploy); a longer maximum silence must also raise FRONTEND_SILENCE_LIMIT_MS first (docs/engineering-practices.md, 'Shared timeouts'). Where the ACs above name stall-guard.ts, analyze-pun.ts or '5 rounds', read the module.

From TASK-45 (2026-09-29): the ladder is now gemini-3.5-flash-lite -> gemini-3.1-flash-lite -> gemini-3.8-flash. Flash went past MODEL_STALL_LIMIT_MS (30 s) before its first chunk on 3 attempts in a row; whether that was a stall or long thinking is unknown. If Flash's normal time to first chunk is near 30 s, the bottom rung rarely answers, and raising the limit shrinks RETRY_BUDGET_MS (see the TASK-44 note above).

From TASK-47 (2026-09-29): gemini-3.1-flash-lite now runs at thinkingLevel MEDIUM (GEMINI_MODEL_CONFIG in backend/src/config.ts), which adds about 1.3 s before its first chunk on follow-ups (median 2.8 s -> 4.0 s, slowest 7.3 s). Measure each model with the settings production gives it (through Backend, or with its GEMINI_MODEL_CONFIG), and include first turns: a first turn makes a tool-calling model call and a call after the tool result, each thinking at MEDIUM. Only follow-ups were timed in TASK-47.

2026-09-29: AC #4 done for the Flash-Lite rungs (docs/experiments/task-32, run 2026-09-29T10-12-09.489Z, 50 replies). Harness runs createChatFlow in-process with stallLimitMs 120 s and times each ladder attempt through registered timed/<model> wrapper models carrying GEMINI_MODEL_CONFIG. Longest silence: 3.5 1.3 s (45 attempts); 3.1 14.8 s (47), a mid-reply gap between two text chunks, not before the first. Slowest first chunk 7.0 s (3.1). MODEL_STALL_LIMIT_MS kept at 30 s (~2x worst); comment corrected (the longest silence isn't necessarily before the first chunk); contracts.md records it. Flash follow-up: TASK-50. Dependents informed: TASK-28, TASK-37, TASK-43, TASK-45. Reviews: code + architectural subagents; applied: '15 s would have failed it' was wrong (14.84 s gap, 0.16 s to spare), README no longer infers where thinking happens (Backend doesn't request thoughts), stalls recorded via the guard's abort reason and reported as >= stallLimitMs, summarize sorts explicitly, contracts.md cites the constant and sample sizes. AC #1-#3 still wait on TASK-16.
<!-- SECTION:NOTES:END -->
