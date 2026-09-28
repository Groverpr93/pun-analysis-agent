---
id: TASK-43
title: >-
  Backend: step down a ladder of Flash-Lite models, with backoff, when Gemini
  fails
status: To Do
assignee:
  - '@yaisiel.torres'
created_date: '2026-09-28 15:05'
updated_date: '2026-09-28 16:27'
labels: []
dependencies:
  - TASK-42
references:
  - backend/src/flows/chat.ts
  - backend/src/config.ts
  - backend/src/routes/chat.ts
  - docs/contracts.md
priority: medium
type: feature
project: backend
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A Gemini 503 or quota spike currently fails the whole /api/chat reply with TASK-23's busy message, and TASK-42 adds stalls as another way a model call fails. Capacity and free-tier quota are per model, so a different model often answers when the configured one can't: TASK-38/41 saw Flash 503 on 3 of 3 attempts across hours on 2026-09-28, while Flash-Lite answered every time.

Agreed with the user on 2026-09-28: the ladder is gemini-flash-lite-latest -> gemini-3.1-flash-lite -> gemini-2.5-flash-lite (Flash is off the ladder; TASK-41/TASK-37 own switching back to it). Gemini 2.0 Flash / Flash-Lite were considered but were shut down on 2026-06-01 (ai.google.dev/gemini-api/docs/deprecations). gemini-3.1-flash-lite's earliest shutdown is 2027-05-07. gemini-2.5-flash-lite is access-restricted to projects that used it before; the user confirmed this project shows usage for it in AI Studio.

Genkit's built-in retry() and fallback() middleware were reviewed and don't fit: retry() re-streams after chunks were already sent (duplicate text) and retries RESOURCE_EXHAUSTED; fallback() calls the next model without onChunk or abortSignal, so it neither streams nor honours the user's stop.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each model call in a reply tries the ladder's models in order; every model gets the same exponential backoff schedule, defined once and applied per rung
- [ ] #2 Only failures before the model call streamed its first chunk are retried or stepped down; a failure after a chunk was sent fails the reply, so no text is streamed twice
- [ ] #3 A 429 (RESOURCE_EXHAUSTED) skips the rest of that model's backoff and steps straight to the next model
- [ ] #4 Once a model call in a reply succeeds, the reply's later model calls use only that model; if it then fails through its backoff, the reply fails with TASK-23's wording rather than stepping down
- [ ] #5 A user stop during a call or a backoff wait ends the reply as a cancel with no further Gemini requests
- [ ] #6 Each retry and step-down is logged with the model, attempt and cause; the reply's final error, if any, keeps TASK-23's user-facing wording
- [ ] #7 Backend tests use Genkit test-double models for each rung and fail if backoff, step-down, the 429 short-circuit, pegging or the no-retry-after-first-chunk rule is removed
- [ ] #8 The longest silence the ladder can add before a reply's next /api/chat event is computed and documented next to the backoff values; docs/contracts.md's maximum-silence number and Frontend's silence limit (TASK-28's constant, or TASK-28 itself if not yet built) are updated to match, with Frontend deployed first so no open tab aborts a healthy retrying reply; and one reply's worst case stays under Cloud Run's request timeout (300 s default) — or Backend sends keepalive events during retries so the silence bound doesn't grow at all
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
From TASK-42's architectural review (2026-09-28): the stall guard is innermost and per attempt, so retries before the first chunk add up to rungs x attempts x (MODEL_STALL_LIMIT_MS + backoff) of silence before the first event; 3 rungs x 3 attempts at 30 s is already ~270 s, near Cloud Run's 300 s. docs/engineering-practices.md's consumer-first deploy rule covers stream shape, not timing, so the deploy order is written into the AC. One way to keep the 50 s bound regardless of ladder length: send data: {"message": ""} keepalives during retries/backoff (already valid per contracts.md; Frontend's genkit-flow-stream.ts accepts an empty string). Decide between that and a bounded ladder when planning.

2026-09-28 (TASK-42, later): MODEL_STALL_LIMIT_MS was lowered to 15 s partly for this task's sake: 3 rungs x 3 attempts at 15 s is ~135 s of silence before the first event (plus backoff), not ~270 s as in the note above.
<!-- SECTION:NOTES:END -->
