---
id: TASK-48
title: >-
  Backend: step down the model ladder on a stall and on a missing or forbidden
  model
status: To Do
assignee: []
created_date: '2026-09-29 09:54'
updated_date: '2026-09-29 10:42'
labels: []
dependencies:
  - TASK-43
  - TASK-32
references:
  - backend/src/flows/model-ladder.ts
  - backend/src/flows/stall-guard.ts
  - docs/contracts.md
  - packages/timeouts/index.js
priority: medium
type: enhancement
project: backend
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-43's ladder (backend/src/flows/model-ladder.ts, ACTION_BY_STATUS) retries a stall like a 503, with up to 3 attempts per model, and fails the reply on any status it doesn't list. Two cases came up after it shipped:

- Stalls use up the retry budget before the ladder can step down. A stall costs the full MODEL_STALL_LIMIT_MS (30 s) where a 503 costs under a second, so three stalls on the first model (30 + 1 + 30 + 2 + 30 = 93 s) exceed RETRY_BUDGET_MS (80 s), and the reply fails without trying another model. TASK-45 hit this with gemini-3.8-flash on the top rung, and moving Flash to the last rung only avoided it for that model. In TASK-45's runs a model that stalled kept stalling, and a stall usually means that model is overloaded right now, so another model is the better next try. Stepping down after one stall fits all three models in the current budget (30 + 30 s, then the last model's attempt, which the baseline already counts), so no timeout needs raising.
- NOT_FOUND (404) and PERMISSION_DENIED (403) fail the reply, but both can be specific to one model: a shut-down or renamed model (gemini-3.1-flash-lite can be shut down from 2027-05-07), or one this project can't use. TASK-45 found gemini-2.5-flash-lite answering 404 for this project and removed it from the ladder; with this change, a model like that would be skipped instead of failing every reply that reaches it. An invalid API key also answers 403, which then costs two extra fast-failing requests before the reply fails; that trade was accepted.

Decided with the user on 2026-09-29: a 504 from Gemini itself, which arrives quickly, keeps the normal backoff like a 503, and NOT_FOUND/PERMISSION_DENIED step down. How a stall is handled waits on TASK-32: its measurements of each ladder model's time to first chunk, and of whether an attempt after a stall answers, decide between stepping down after one stall (which fits all three models in today's budget) and allowing a second attempt (31 s more per model, so fewer models are reached). The stall part of this task can't start before then; the rest can. The stall guard tags its own failures with detail.cause "model_stalled" (backend/src/flows/stall-guard.ts), which is what tells the two apart, since both are DEADLINE_EXCEEDED.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A model call that stalls (DEADLINE_EXCEEDED with detail.cause "model_stalled") is handled by a rule chosen from TASK-32's measurements (step down after one stall, or allow a second attempt on the same model first), with the data and the choice recorded next to the rule; with the values in force, a reply whose every attempt stalls reaches at least the ladder's second model within RETRY_BUDGET_MS
- [ ] #2 A DEADLINE_EXCEEDED from Gemini itself (a 504, without the stall cause) keeps the normal backoff, as UNAVAILABLE does
- [ ] #3 NOT_FOUND and PERMISSION_DENIED step down to the next model at once; any other unlisted status still fails the reply
- [ ] #4 A stall or 403/404 on the pegged model still fails the reply rather than stepping down (TASK-43 AC #4)
- [ ] #5 Tests with Genkit test-double models fail if any of these mappings is removed, including a test, with the real RETRY_BUDGET_MS and MODEL_STALL_LIMIT_MS, of how far down the ladder a reply that stalls every time gets
- [ ] #6 docs/contracts.md's "Retries." section and the policy's doc comment state the new rules
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-29 (user): one stall per model stays the rule for now. Whether to allow a second attempt after a stall waits on TASK-32's measurements; if they show second attempts often succeeding, revisit AC #1 (it would need a stall count per model, separate from the attempt count).

2026-09-29 (user, correcting the note above): the stall rule itself, not just a later switch to two stalls, waits on TASK-32; AC #1 now leaves the choice to its data. The 504 and 404/403 criteria are independent of TASK-32.

2026-09-29 (user): archived without being implemented. TASK-32's preliminary run (docs/experiments/task-32) found no stall in 92 Flash-Lite attempts (longest silence 14.8 s against a 30 s limit), and the only model seen stalling, gemini-3.8-flash, is the ladder's last rung, where a stall can't step down anyway; so the stall rule has nothing to act on. The 404/403 step-down would only matter if a model on the ladder were removed or restricted, which TASK-45 handled by hand for gemini-2.5-flash-lite; gemini-3.1-flash-lite's earliest shutdown is 2027-05-07. Work moved to Inference. If the ladder changes, ACTION_BY_STATUS in backend/src/flows/model-ladder.ts is where these would go.
<!-- SECTION:NOTES:END -->
