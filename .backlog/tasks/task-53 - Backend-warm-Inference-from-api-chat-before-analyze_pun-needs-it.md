---
id: TASK-53
title: 'Backend: warm Inference from /api/chat before analyze_pun needs it'
status: To Do
assignee:
  - '@yaitorr'
created_date: '2026-10-02 10:04'
updated_date: '2026-10-04 20:57'
labels: []
milestone: m-4
dependencies:
  - TASK-51
  - TASK-52
references:
  - backend/src/routes/chat.ts
  - docs/project-spec.md
priority: medium
project: backend
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Inference scales to zero, so the first analyze_pun call after it has been idle waits for its cold start and can exceed `INFERENCE_TIMEOUT_MS`, degrading to the undetermined result. Gemini spends seconds on its first model turn before calling the tool, so starting Inference's cold start when a chat request arrives hides most of it. Backend can stay warm while Inference idles out (chats without puns keep Backend busy), so warming only when Backend starts is not enough. Decided with Yai on 2026-10-02: no background job, since Cloud Run throttles CPU between requests and AGENTS.md's Performance section rules out polling; no chat ID, since /api/chat is stateless and adding one would change the contract; Inference concurrency stays at 1, since the ping only matters while Inference is cold.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An /api/chat request sends `GET /health` to Inference when Backend has not sent one in the last 5 minutes; the ping never delays or fails the chat reply
- [ ] #2 The ping carries Backend's ID token like analyze_pun's calls, and a failed ping is logged and not retried
- [ ] #3 Tests cover: the first request pings, a request inside the window does not, a request after the window does, and a failing ping leaves the reply unaffected
- [ ] #4 docs/contracts.md and docs/project-spec.md describe the warm-up as a Backend-to-Inference dependency, and an architectural review is done
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->
