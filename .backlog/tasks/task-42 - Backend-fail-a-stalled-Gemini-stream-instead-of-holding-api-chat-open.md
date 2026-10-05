---
id: TASK-42
title: 'Backend: fail a stalled Gemini stream instead of holding /api/chat open'
status: Done
assignee:
  - '@yaitorr'
created_date: '2026-09-28 14:45'
updated_date: '2026-10-04 20:57'
labels: []
dependencies: []
references:
  - backend/src/flows/chat.ts
  - backend/src/routes/chat.ts
  - backend/src/tools/analyze-pun.ts
  - .github/workflows/deploy-backend.yml
priority: medium
type: bug
project: backend
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found during TASK-31.1's live check (2026-09-28, local Backend, gemini-flash-lite-latest during a Gemini 503 spike). Two /api/chat requests got no events at all for ~300 s, until the client's own body timeout fired; Backend logged nothing for them in that time, only "This operation was aborted" once the client disconnected. Backend bounds Inference (INFERENCE_TIMEOUT_MS in backend/src/tools/analyze-pun.ts), but the Gemini call in backend/src/flows/chat.ts only ends on the request's abortSignal, i.e. when the client gives up. Users watch the thinking otter (TASK-31.2) indefinitely, and on Cloud Run the request holds an instance until the service's 300 s default timeout (deploy-backend.yml sets no --timeout), which matters with --max-instances capped on free tier (AGENTS.md Performance). TASK-28 is the Frontend-side guard for a Backend that never answers; this is the Backend-side guard for an upstream that never answers, and TASK-28's limit has to stay above whatever this one sets. Error wording for model failures is TASK-23's mapping in routes/chat.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Gemini call that stalls (no response or no further stream data) ends within a named, documented limit, and the reply fails with a /api/chat error event in the existing Genkit stream format (docs/contracts.md) rather than staying open until the client or Cloud Run cuts it
- [x] #2 The limit does not cut off legitimate slow replies, including replies that wait on analyze_pun rounds bounded by INFERENCE_TIMEOUT_MS; the reasoning for the value is recorded next to it
- [x] #3 The user-facing message for a stall follows TASK-23's generic model-error wording (no Gemini URL, model name or raw upstream payload), and Backend logs the stall with a distinguishable cause
- [x] #4 A user stop (client abort) still ends the call as a cancel, not as a stall
- [x] #5 Backend tests use a Genkit test-double model that stalls, and fail if the limit is removed
- [x] #6 TASK-28 is updated so its client-side limit is stated relative to this one
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New model middleware failStalledModelCalls(stallLimitMs) in backend/src/flows/stall-guard.ts. Per model call: an idle timer armed when the call starts and restarted on every streamed chunk; on expiry it aborts the call's own AbortController with a GenkitError DEADLINE_EXCEEDED, detail { cause: 'model_stalled', stallLimitMs }. That controller is combined with the request's abortSignal (AbortSignal.any) and passed to next, and the call is raced against that combined signal, so whichever of a user stop or a stall comes first decides the error, even for a model that ignores its signal. Chunks after the call settles are dropped. Tool execution happens between model calls, so analyze_pun's INFERENCE_TIMEOUT_MS rounds never count against it (AC #2).
2. Wired last (closest to the model) in createChatFlow's use: [numberToolRequests(), failStalledModelCalls(...)], so TASK-43's ladder can wrap it per attempt. createChatFlow takes an optional { stallLimitMs } so tests use a short limit.
3. Route unchanged: DEADLINE_EXCEEDED already maps to TASK-23's BUSY_MESSAGE, and the '/api/chat flow failed' log carries err.detail (AC #3). User abort is still checked first (AC #4).
4. Tests: 8 fake-timer unit tests (stall before/after a chunk, steady stream longer than the limit, user stop first, chunks after failure dropped, non-streamed call, timer cleared, model's signal aborted); flow tests (stall fails the reply, analyze_pun slower than the limit succeeds, the stall abort reaches a defineModel's own signal); route test (exact error event + logged cause). Per-test timeouts so a broken guard fails rather than hangs.
5. MODEL_STALL_LIMIT_MS = 30 s provisional with reasoning at the constant; docs/contracts.md documents it and the resulting 50 s maximum silence (and what it doesn't cover: startup, Cloud Run's 300 s cap); TASK-28 restated as a silence limit; TASK-32 measures the value.
6. Code review + architectural review; docs drift check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Code review (subagent): no blocking bugs; applied: race on the combined signal so a stop also ends a signal-ignoring model call, drop chunks after settle, per-test timeouts in stall-guard.test.ts, flow test that the abort reaches the model's own signal, non-streamed test, 200 ms real-time limit in flow/route tests to avoid flakes, JSDoc fixes (after-last-chunk gap; 'without this limit'), note on the plugin's extra 'This operation was aborted' log line. Mutation-checked: removing the race, the user-stop combination, the settled check, the restart on chunk, clearTimeout, or passing the signal, and forcing streaming, each fails a test (none hangs).
Architectural review (subagent): 50 s bound verified against Genkit's generate loop; applied: contracts.md now says the bound runs from when Backend starts the reply, what it doesn't cover, and Cloud Run's 300 s cap; TASK-28 description rewritten (silence timer, abort with a TimeoutError reason so isAbort doesn't read it as a stop) and made to depend on TASK-42; TASK-43 AC reworded to update contracts.md + Frontend's constant with Frontend deployed first, stay under 300 s, or use keepalives; TASK-32 AC #3/#4 reworded; TASK-37 note to re-check the limit before Flash; INFERENCE_TIMEOUT_MS docstring no longer calls the Inference total Frontend's worst-case wait.
Docs drift: README.md, project-spec.md, local-setup.md, AGENTS.md make no timing claims affected (confirmed by the architectural review); only contracts.md changed.
Validation: backend pnpm test 131/131 (3 consecutive runs), tsc --noEmit, biome check clean.

2026-09-28: at the user's call, MODEL_STALL_LIMIT_MS lowered from 30 s to 15 s (maximum silence 35 s): halves the silence TASK-43's retries can add, at the cost of less room for a slow first chunk; reasoning at the constant, contracts.md, TASK-28 AC #1, TASK-37 and TASK-43 notes updated. Plan step 5's '30 s' now reads 15 s.

2026-09-28: a MODEL_STALL_LIMIT_MS env var override was added and then reverted before commit. The user wants one source of truth for the waiting chain's timeouts (TASK-44, which decides overrides are local-only, refused on Cloud Run); a production override would bypass it, and a local-only one adds little over editing the constant, so it's left to TASK-44 rather than built twice.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Backend now fails a Gemini call that goes quiet instead of holding /api/chat open. failStalledModelCalls (backend/src/flows/stall-guard.ts) is a per-model-call idle timer, restarted on every streamed chunk; after MODEL_STALL_LIMIT_MS (15 s, provisional; TASK-32 measures it) it aborts the call's request and fails it with DEADLINE_EXCEEDED, detail { cause: 'model_stalled' }, which the route maps to TASK-23's busy message and logs. The call is raced against its user-or-stall signal, so either ends it even if the model ignores the signal, and a stop that comes first stays a cancel. analyze_pun runs between model calls, so Inference's wait never counts. docs/contracts.md documents the limit and the bound Frontend relies on: once a reply has started, an event at least every 35 s (15 s + INFERENCE_TIMEOUT_MS), within Cloud Run's 300 s cap. TASK-28 was restated against it; TASK-43 (model ladder) and TASK-44 (one source of truth for timeouts) were added. Verified by 131/131 backend tests (8 fake-timer unit tests, flow and route stall tests, each mutation-checked), tsc and biome, plus independent code and architectural reviews. Merged in #69 (331d388).
<!-- SECTION:FINAL_SUMMARY:END -->
