---
id: TASK-28
title: 'Frontend: client-side timeout for /api/chat'
status: To Do
assignee: []
created_date: '2026-09-25 18:30'
updated_date: '2026-09-28 19:30'
labels: []
dependencies:
  - TASK-42
  - TASK-44
references:
  - frontend/src/lib/chat/live-chat-model-adapter.ts
  - docs/contracts.md
  - backend/src/flows/stall-guard.ts
priority: low
type: enhancement
project: frontend
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Raised during PR #31 review (Livia's error-scenario feedback). The live adapter's fetch only aborts on the user's stop, so a Backend that accepts /api/chat but never answers leaves the user waiting until Cloud Run cuts the request (CLOUD_RUN_REQUEST_TIMEOUT_MS, which deploy-backend.yml sets as --timeout); only then does TASK-24's 'cut off' / 'Couldn't get a reply' text show.

Since TASK-42, Backend itself fails a Gemini call that goes quiet, so once it has started a reply it sends an event at least every MAX_SILENCE_MS (MODEL_STALL_LIMIT_MS + INFERENCE_TIMEOUT_MS) or ends it. The values live in @pun-agent/timeouts (packages/timeouts, TASK-44); docs/contracts.md states the bound and what it doesn't cover (App Check token fetch, cold start, queueing for the single instance). A reply that keeps streaming has no Backend-side maximum short of Cloud Run's request timeout, so a fixed whole-reply AbortSignal.timeout(ms) would either cut off healthy long replies or have to exceed that timeout. The guard is therefore a limit on silence: a timer that restarts on every stream event (including empty-text messages, or simply every body read).

Pitfall: a resettable timer is naturally built on an AbortController, and controller.abort() with no reason rejects with an AbortError, which the adapter's name-based isAbort check (TASK-24) treats as the user's stop, so the timeout would show as a cancel. Abort with a reason named TimeoutError instead, e.g. controller.abort(new DOMException(message, 'TimeoutError')), and give it its own user-facing text.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The /api/chat request is aborted after FRONTEND_SILENCE_LIMIT_MS (imported from @pun-agent/timeouts, with no copy of its value in frontend/) without a stream event; the module's tests already check it exceeds Backend's maximum silence plus the App Check wait and startup margin
- [ ] #2 Hitting the limit shows its own short user-facing sentence in the error box and is logged to the console; a user stop still shows as a cancel, and a real stop racing the timeout is not reported as a timeout
- [ ] #3 An in-flight analyze_pun call is settled as failed when the limit hits, consistent with TASK-10 AC #7
- [ ] #4 Unit tests pin the timeout path's text with fake timers, and the timeout is checked in the running UI against a Backend that never answers
- [ ] #5 A pull-request check fails a change whose Backend silence plus App Check wait and margin (MAX_SILENCE_MS + APP_CHECK_TIMEOUT_MS + FRONTEND_SILENCE_MARGIN_MS) no longer fits under main's FRONTEND_SILENCE_LIMIT_MS, enforcing docs/engineering-practices.md's deploy order for the shared timeouts (lengthen the silence only after the raised limit has shipped)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-28 (TASK-42): Backend now fails a model call that sends nothing for MODEL_STALL_LIMIT_MS (30 s, provisional; TASK-32 measures it), restarting on every chunk. So a reply that keeps streaming has no overall maximum, but one that hasn't failed never goes more than MODEL_STALL_LIMIT_MS + INFERENCE_TIMEOUT_MS (50 s) without an event (docs/contracts.md). AC #1 was restated from a whole-reply deadline to a limit on silence to match: a fixed AbortSignal.timeout(ms) for the whole reply would either cut off long but healthy replies or have to be longer than any reply could take. Resetting the timer on each stream event (rather than AbortSignal.any with a fixed timeout) is what that implies. TASK-43 (model ladder with backoff) will lengthen Backend's longest silence, and must update this number.

2026-09-28 (TASK-42, later): MODEL_STALL_LIMIT_MS was lowered from 30 s to 15 s before merge, so the maximum silence is 35 s, not the 50 s in the note above.

2026-09-28 (TASK-44): the silence limit now lives in @pun-agent/timeouts as FRONTEND_SILENCE_LIMIT_MS (75 s), next to MAX_SILENCE_MS (MODEL_STALL_LIMIT_MS 30 s + INFERENCE_TIMEOUT_MS 20 s = 50 s), APP_CHECK_TIMEOUT_MS (10 s) and FRONTEND_SILENCE_MARGIN_MS (15 s); the numbers in the notes above are out of date. AC #1 restated to import it rather than choose a value. AC #5 added from TASK-44's architectural review: the module's own tests only compare values within one commit, so nothing yet stops a single change from lengthening the silence past the limit that open tabs already run; that only matters once this task makes Frontend enforce the limit, hence here.
<!-- SECTION:NOTES:END -->
