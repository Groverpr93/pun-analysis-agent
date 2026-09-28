---
id: TASK-42
title: 'Backend: fail a stalled Gemini stream instead of holding /api/chat open'
status: To Do
assignee: []
created_date: '2026-09-28 14:45'
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
- [ ] #1 A Gemini call that stalls (no response or no further stream data) ends within a named, documented limit, and the reply fails with a /api/chat error event in the existing Genkit stream format (docs/contracts.md) rather than staying open until the client or Cloud Run cuts it
- [ ] #2 The limit does not cut off legitimate slow replies, including replies that wait on analyze_pun rounds bounded by INFERENCE_TIMEOUT_MS; the reasoning for the value is recorded next to it
- [ ] #3 The user-facing message for a stall follows TASK-23's generic model-error wording (no Gemini URL, model name or raw upstream payload), and Backend logs the stall with a distinguishable cause
- [ ] #4 A user stop (client abort) still ends the call as a cancel, not as a stall
- [ ] #5 Backend tests use a Genkit test-double model that stalls, and fail if the limit is removed
- [ ] #6 TASK-28 is updated so its client-side limit is stated relative to this one
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->
