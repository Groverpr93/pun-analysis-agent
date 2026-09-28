---
id: TASK-43
title: >-
  Backend: step down a ladder of Flash-Lite models, with backoff, when Gemini
  fails
status: In Progress
assignee:
  - '@yaisiel.torres'
created_date: '2026-09-28 15:05'
updated_date: '2026-09-28 18:28'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. config.ts: GEMINI_MODEL, if set, overrides the ladder (a one-model ladder: backoff, no step-down); unset leaves config.geminiModel undefined and uses the default ladder gemini-flash-lite-latest -> gemini-3.1-flash-lite -> gemini-2.5-flash-lite.
2. New per-reply model middleware (flows/model-ladder.ts), modelled on Genkit's fallback(): resolveModel per rung and call it with onChunk + abortSignal; failStalledModelCalls wraps each attempt, so every attempt gets its own stall timer.
3. Retry policy: UNAVAILABLE, DEADLINE_EXCEEDED (including stalls) and INTERNAL (Gemini 500) back off, then step down; RESOURCE_EXHAUSTED steps down right away; anything else, including errors that aren't GenkitErrors, fails at once. Nothing is retried after the call's first chunk, and a user stop (during a call or a wait) ends the reply with no more requests.
4. Backoff per rung: 3 attempts, waits of 1 s then 2 s with a little jitter. Per-reply retry budget 90 s = 300 s Cloud Run timeout - 190 s baseline (6 calls x 15 s stall + 5 tool rounds x 20 s Inference) - 20 s margin. A retry starts only if spent + wait + stall limit fits.
5. Pegging: the first model call that succeeds fixes the model for the rest of the reply; later failures back off on that model only, then fail with TASK-23's wording.
6. Keepalives: data: {"message": ""} when an attempt fails and when its wait ends, so contracts.md's 35 s maximum silence is unchanged (holds while the longest wait <= stall limit).
7. Log every retry and step-down with model, attempt and cause.
8. Tests with Genkit test-double models per rung and fake timers, each failing if backoff, step-down, the 429 short-circuit, pegging, no-retry-after-first-chunk, the budget or stop handling is removed.
9. Docs: contracts.md gets keepalives and the retry budget; local-setup.md covers GEMINI_MODEL's new meaning. Coordinate with TASK-44 (notes left there); code review + architectural review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
From TASK-42's architectural review (2026-09-28): the stall guard is innermost and per attempt, so retries before the first chunk add up to rungs x attempts x (MODEL_STALL_LIMIT_MS + backoff) of silence before the first event; 3 rungs x 3 attempts at 30 s is already ~270 s, near Cloud Run's 300 s. docs/engineering-practices.md's consumer-first deploy rule covers stream shape, not timing, so the deploy order is written into the AC. One way to keep the 50 s bound regardless of ladder length: send data: {"message": ""} keepalives during retries/backoff (already valid per contracts.md; Frontend's genkit-flow-stream.ts accepts an empty string). Decide between that and a bounded ladder when planning.

2026-09-28 (TASK-42, later): MODEL_STALL_LIMIT_MS was lowered to 15 s partly for this task's sake: 3 rungs x 3 attempts at 15 s is ~135 s of silence before the first event (plus backoff), not ~270 s as in the note above.
<!-- SECTION:NOTES:END -->
