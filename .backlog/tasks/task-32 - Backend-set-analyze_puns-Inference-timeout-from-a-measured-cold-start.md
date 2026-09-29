---
id: TASK-32
title: 'Backend: set analyze_pun''s Inference timeout from a measured cold start'
status: To Do
assignee:
  - '@yaisiel.torres'
created_date: '2026-09-27 15:25'
updated_date: '2026-09-29 09:37'
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
- [ ] #4 MODEL_STALL_LIMIT_MS (TASK-42, backend/src/flows/stall-guard.ts) is set from measured Gemini time to first chunk and longest gap between chunks, over TASK-38's prompt set, for every model production can run: the configured GEMINI_MODEL and, once TASK-43 lands, each model on its ladder; its margin is explained next to the constant and in docs/contracts.md
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Carries TASK-9's former AC #5, removed from TASK-9 on 2026-09-27: 'The Inference timeout is a named constant whose value is based on a measured Inference cold start on Cloud Run ... and the value and measurement are recorded in docs/contracts.md so Frontend can rely on the worst-case wait.' The constant already exists (INFERENCE_TIMEOUT_MS, backend/src/tools/analyze-pun.ts); contracts.md also states the per-reply worst case (up to 5 rounds x the timeout), which must be updated with the measured value.

From TASK-14's architectural review (2026-09-28): AC #1 measures time to the first successful /analyze, but /analyze answers 500 (NotImplementedError) until TASK-16, and the dominant cold-start cost (spaCy/WordNet loads, and torch if TASK-19 adds sentence-transformers) only appears once the real model runs. So this effectively depends on TASK-16, and should be re-measured if TASK-19 changes the model. The service is IAM-private: measuring needs roles/run.invoker (or project admin) and an ID token, e.g. `curl -H "Authorization: Bearer $(gcloud auth print-identity-token)" <url>/analyze`.

2026-09-28: MODEL_STALL_LIMIT_MS was added to this task at the user's request when TASK-42 set it provisionally. Measuring it doesn't need Inference (a local Backend with APP_CHECK=off, as in TASK-38, is enough), so it needn't wait for TASK-16 like the cold-start measurement does.

2026-09-28 (TASK-42 architectural review): Frontend no longer relies on the per-reply Inference total (5 rounds x INFERENCE_TIMEOUT_MS) as its worst-case wait; it relies on the maximum silence between events in docs/contracts.md. AC #3 was reworded to match, and AC #4 widened from 'TASK-43's ladder' to every model production can run, since GEMINI_MODEL is configurable and -latest aliases move.

2026-09-28 (TASK-44): MODEL_STALL_LIMIT_MS (30 s), INFERENCE_TIMEOUT_MS (20 s) and MAX_TOOL_ROUNDS (3, was Genkit's implicit 5) now live in packages/timeouts/index.js (@pun-agent/timeouts), not stall-guard.ts or analyze-pun.ts, and its tests check they still fit together. Headroom is small: with 3 rounds and Cloud Run's timeout at 400 s, the retry budget still fits one retry only while the stall limit stays at or below 35 s. A measured value above that must raise CLOUD_RUN_REQUEST_TIMEOUT_MS in the same change (safe in one deploy); a longer maximum silence must also raise FRONTEND_SILENCE_LIMIT_MS first (docs/engineering-practices.md, 'Shared timeouts'). Where the ACs above name stall-guard.ts, analyze-pun.ts or '5 rounds', read the module.

From TASK-45 (2026-09-29): the ladder is now gemini-3.5-flash-lite -> gemini-3.1-flash-lite -> gemini-3.8-flash. Flash went past MODEL_STALL_LIMIT_MS (30 s) before its first chunk on 3 attempts in a row; whether that was a stall or long thinking is unknown. If Flash's normal time to first chunk is near 30 s, the bottom rung rarely answers, and raising the limit shrinks RETRY_BUDGET_MS (see the TASK-44 note above).

From TASK-47 (2026-09-29): gemini-3.1-flash-lite now runs at thinkingLevel MEDIUM (GEMINI_MODEL_CONFIG in backend/src/config.ts), which adds about 1.3 s before its first chunk on follow-ups (median 2.8 s -> 4.0 s, slowest 7.3 s). Measure each model with the settings production gives it (through Backend, or with its GEMINI_MODEL_CONFIG), and include first turns: a first turn makes a tool-calling model call and a call after the tool result, each thinking at MEDIUM. Only follow-ups were timed in TASK-47.
<!-- SECTION:NOTES:END -->
