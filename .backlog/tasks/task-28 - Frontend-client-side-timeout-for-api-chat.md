---
id: TASK-28
title: 'Frontend: client-side timeout for /api/chat'
status: To Do
assignee: []
created_date: '2026-09-25 18:30'
updated_date: '2026-09-28 16:31'
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
Raised during PR #31 review (Livia's error-scenario feedback). The live adapter's fetch only aborts on the user's stop, so a Backend that accepts /api/chat but never answers leaves the user waiting until Cloud Run cuts the request (deploy-backend.yml sets no --timeout, so its 300 s default applies); only then does TASK-24's 'cut off' / 'Couldn't get a reply' text show.

Since TASK-42, Backend itself fails a Gemini call that goes quiet, so once it has started a reply it sends an event at least every MODEL_STALL_LIMIT_MS + INFERENCE_TIMEOUT_MS (15 s + 20 s = 35 s today) or ends it; docs/contracts.md states the bound and what it doesn't cover (App Check token fetch, cold start, queueing for the single instance). A reply that keeps streaming has no Backend-side maximum short of Cloud Run's 300 s, so a fixed whole-reply AbortSignal.timeout(ms) would either cut off healthy long replies or have to exceed 300 s. The guard is therefore a limit on silence: a timer that restarts on every stream event (including empty-text messages, or simply every body read).

Pitfall: a resettable timer is naturally built on an AbortController, and controller.abort() with no reason rejects with an AbortError, which the adapter's name-based isAbort check (TASK-24) treats as the user's stop, so the timeout would show as a cancel. Abort with a reason named TimeoutError instead, e.g. controller.abort(new DOMException(message, 'TimeoutError')), and give it its own user-facing text.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The /api/chat request is aborted after a named, documented limit on silence (time since the last stream event) that exceeds Backend's longest silence in a healthy reply as docs/contracts.md states it (MODEL_STALL_LIMIT_MS + INFERENCE_TIMEOUT_MS, 15 s + 20 s = 35 s as of TASK-42) plus startup time, with the reasoning recorded
- [ ] #2 Hitting the limit shows its own short user-facing sentence in the error box and is logged to the console; a user stop still shows as a cancel, and a real stop racing the timeout is not reported as a timeout
- [ ] #3 An in-flight analyze_pun call is settled as failed when the limit hits, consistent with TASK-10 AC #7
- [ ] #4 Unit tests pin the timeout path's text with fake timers, and the timeout is checked in the running UI against a Backend that never answers
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
<!-- SECTION:NOTES:END -->
