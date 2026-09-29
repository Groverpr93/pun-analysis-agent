---
id: TASK-43
title: >-
  Backend: step down a ladder of Flash-Lite models, with backoff, when Gemini
  fails
status: Done
assignee:
  - '@yaisiel.torres'
created_date: '2026-09-28 15:05'
updated_date: '2026-09-29 09:47'
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
- [x] #1 Each model call in a reply tries the ladder's models in order; every model gets the same exponential backoff schedule, defined once and applied per rung
- [x] #2 Only failures before the model call streamed its first chunk are retried or stepped down; a failure after a chunk was sent fails the reply, so no text is streamed twice
- [x] #3 A 429 (RESOURCE_EXHAUSTED) skips the rest of that model's backoff and steps straight to the next model
- [x] #4 Once a model call in a reply succeeds, the reply's later model calls use only that model; if it then fails through its backoff, the reply fails with TASK-23's wording rather than stepping down
- [x] #5 A user stop during a call or a backoff wait ends the reply as a cancel with no further Gemini requests
- [x] #6 Each retry and step-down is logged with the model, attempt and cause; the reply's final error, if any, keeps TASK-23's user-facing wording
- [x] #7 Backend tests use Genkit test-double models for each rung and fail if backoff, step-down, the 429 short-circuit, pegging or the no-retry-after-first-chunk rule is removed
- [x] #8 The longest silence the ladder can add before a reply's next /api/chat event is computed and documented next to the backoff values; docs/contracts.md's maximum-silence number and Frontend's silence limit (TASK-28's constant, or TASK-28 itself if not yet built) are updated to match, with Frontend deployed first so no open tab aborts a healthy retrying reply; and one reply's worst case stays under Cloud Run's request timeout (300 s default) — or Backend sends keepalive events during retries so the silence bound doesn't grow at all
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. config.ts: GEMINI_MODEL, if set, replaces the ladder with that one model (backoff, no step-down); unset leaves config.geminiModel undefined, and genkit.ts uses GEMINI_MODEL_LADDER: gemini-flash-lite-latest -> gemini-3.1-flash-lite -> gemini-2.5-flash-lite.
2. flows/model-ladder.ts: a per-reply model middleware (declares Genkit's 3-parameter signature so it gets onChunk/abortSignal) that calls each rung's model action itself, looking refs/strings up in the registry, and wraps every attempt in failStalledModelCalls so each attempt has its own stall timer.
3. Retry policy (actionForModelFailure): UNAVAILABLE, DEADLINE_EXCEEDED (including stalls) and INTERNAL -> retry; RESOURCE_EXHAUSTED -> stepDown at once; any other status, or any non-GenkitError -> fail. Nothing is retried after the attempt streamed a chunk; a user stop during a call or a wait ends the reply.
4. Backoff and budget from @pun-agent/timeouts (TASK-44): BACKOFF_ATTEMPTS_PER_MODEL (3), FIRST_BACKOFF_MS (1 s, doubling), BACKOFF_JITTER_PERCENT (25), LONGEST_BACKOFF_WAIT_MS (2.5 s); RETRY_BUDGET_MS = Cloud Run timeout - BASELINE_REPLY_WORST_CASE_MS - margin. Budget rule: failed attempts that another attempt follows count by their duration, plus the waits after them; a call's last attempt is already in the baseline; a retry starts only if spent + its wait <= budget.
5. Pegging: the model that answers a reply's first successful call takes all its later calls; when it fails through its backoff (or 429s), the reply fails with TASK-23's wording.
6. Keepalives: data: {"message": ""} when an attempt fails and when its wait ends, so MAX_SILENCE_MS doesn't grow while LONGEST_BACKOFF_WAIT_MS <= MODEL_STALL_LIMIT_MS (relationship test). routes/chat.ts runs the flow with onChunk, as @genkit-ai/express does, since flow.stream() drops falsy chunks.
7. Each retry and step-down logged (WARNING) with model, attempt, status, detail, next model and wait.
8. Tests: ladder tests with one Genkit mockModel per rung and fake timers, mutation-checked; route, wire-format (keepalive bytes vs @genkit-ai/express) and JSON-logging tests updated.
9. Docs: contracts.md (keepalive message, Retries. section in the module's names); local-setup.md and .env.example for GEMINI_MODEL. Code review + architectural review, and a review of the merge onto TASK-44.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
From TASK-42's architectural review (2026-09-28): the stall guard is innermost and per attempt, so retries before the first chunk add up to rungs x attempts x (MODEL_STALL_LIMIT_MS + backoff) of silence before the first event; 3 rungs x 3 attempts at 30 s is already ~270 s, near Cloud Run's 300 s. docs/engineering-practices.md's consumer-first deploy rule covers stream shape, not timing, so the deploy order is written into the AC. One way to keep the 50 s bound regardless of ladder length: send data: {"message": ""} keepalives during retries/backoff (already valid per contracts.md; Frontend's genkit-flow-stream.ts accepts an empty string). Decide between that and a bounded ladder when planning.

2026-09-28 (TASK-42, later): MODEL_STALL_LIMIT_MS was lowered to 15 s partly for this task's sake: 3 rungs x 3 attempts at 15 s is ~135 s of silence before the first event (plus backoff), not ~270 s as in the note above.

2026-09-28: Implemented. Decisions: keepalives (data: {"message": ""}) rather than a bounded ladder, so MAX_SILENCE_MS doesn't grow; routes/chat.ts moved from flow.stream() to flow.run(onChunk) because Genkit's stream() iterator drops falsy chunks (verified: express handler writes every chunk, and the new wire-format test pins keepalive bytes to it). Non-GenkitErrors fail rather than retry, which includes network failures (the Gemini plugin rethrows them as plain Errors). The explicit signal?.aborted check in the ladder is unreachable through Genkit (the stall guard's race rejects with the AbortError first) and is kept as defence in depth. Budget rule corrected from the plan's first draft: spent (failed attempts that another attempt follows, plus waits) + next wait <= RETRY_BUDGET_MS; the extra stall-limit term double-counted the call's last attempt. After TASK-44 (#72) merged, all values come from @pun-agent/timeouts (stall 30 s, budget 80 s, 3 tool rounds, 400 s Cloud Run timeout); the backoff moved there too, with relationship tests that LONGEST_BACKOFF_WAIT_MS <= MODEL_STALL_LIMIT_MS and that one retry (stall + longest wait) fits the budget.
Validation: backend 166/166 (tsc clean), packages/timeouts 7/7, frontend 141/141. Ladder tests mutation-checked: removing backoff, step-down, the 429 short-circuit, pegging, the no-retry-after-chunk guard, the budget, attempt charging, keepalives, jitter, fail-classification, or the registry lookup key each fails a test; LONGEST_BACKOFF_WAIT_MS drifting from the ladder's formula fails the jitter test. Reviews: code review and architectural review (pre-merge), plus a review of the merge onto TASK-44; all findings fixed or noted.
Not done: no live check against Gemini. gemini-3.1-flash-lite and gemini-2.5-flash-lite haven't been called with this project's key, and TASK-35's thought-signature check hasn't been re-run against them (contracts.md says so). Suggested follow-ups, not created: that live/signature check; TASK-37 AC #6 still names the removed DEFAULT_GEMINI_MODEL, and pinning Flash via GEMINI_MODEL now also gives up the ladder.

2026-09-28: The cross-model check (reachability of the lower models with this key, and follow-ups whose unsigned history was made by another model) is TASK-45. Timing measurements for the ladder's models stay in TASK-32 AC #4.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
/api/chat now retries a Gemini call that fails before its first chunk, through a per-reply model middleware (backend/src/flows/model-ladder.ts). UNAVAILABLE, DEADLINE_EXCEEDED (including stalls) and INTERNAL back off per model (3 attempts, 1 s then 2 s, up to 25% jitter) and then step down the ladder; a 429 steps down at once; anything else fails. A call that has streamed is never retried, the model that answers first gets the rest of the reply, and a user stop ends it. A per-reply RETRY_BUDGET_MS keeps the worst case under Cloud Run's timeout. Empty-message keepalives before and after each wait keep MAX_SILENCE_MS unchanged; routes/chat.ts now runs the flow with onChunk, since flow.stream() drops falsy chunks. GEMINI_MODEL, when set, replaces the ladder with one model. The backoff lives in @pun-agent/timeouts with TASK-44's values, with relationship tests for the longest wait and one retry. Verified with backend 166, timeouts 7 and frontend 141 tests, mutation checks on every ladder behaviour, a wire-format test against @genkit-ai/express, and code, architectural and merge reviews (PR #73). The ladder's models were later changed by TASK-45 (#77) and given per-model config by TASK-47 (#78).
<!-- SECTION:FINAL_SUMMARY:END -->
