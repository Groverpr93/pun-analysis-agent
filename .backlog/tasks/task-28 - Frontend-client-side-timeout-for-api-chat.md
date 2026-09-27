---
id: TASK-28
title: 'Frontend: client-side timeout for /api/chat'
status: To Do
assignee: []
created_date: '2026-09-25 18:30'
updated_date: '2026-09-27 15:40'
labels: []
dependencies:
  - TASK-24
  - TASK-9
  - TASK-32
references:
  - frontend/src/lib/chat/live-chat-model-adapter.ts
  - docs/contracts.md
priority: low
type: enhancement
project: frontend
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Raised during PR #31 review (Livia's error-scenario feedback). The live adapter's fetch only aborts on the user's stop, so a Backend that accepts /api/chat but never answers leaves the user waiting until Cloud Run cuts the request (deploy-backend.yml sets no --timeout, so its 300 s default applies); only then does TASK-24's 'cut off' / 'Couldn't get a reply' text show. Add a client-side limit, e.g. AbortSignal.any([abortSignal, AbortSignal.timeout(ms)]). Note: the timeout rejects with a DOMException named TimeoutError, not AbortError, so the adapter's name-based isAbort check (TASK-24) already won't treat it as a user cancel; it still needs its own user-facing text. The limit must exceed the worst legitimate reply, including Backend's worst case for Inference (docs/contracts.md: INFERENCE_TIMEOUT_MS per round of analyze_pun calls, up to 5 rounds per reply; the value is set from a measured cold start by TASK-32), or it would cut off replies Backend was about to finish.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The /api/chat request is aborted after a named, documented time limit that exceeds Backend's per-reply worst case for Inference in docs/contracts.md plus a normal Gemini reply, with the reasoning recorded
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
