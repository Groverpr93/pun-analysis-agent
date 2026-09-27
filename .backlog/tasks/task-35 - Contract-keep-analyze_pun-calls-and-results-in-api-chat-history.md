---
id: TASK-35
title: 'Contract: keep analyze_pun calls and results in /api/chat history'
status: To Do
assignee: []
created_date: '2026-09-27 18:55'
labels: []
dependencies:
  - TASK-9
  - TASK-10
references:
  - docs/contracts.md
  - frontend/src/lib/chat/message-text.ts
  - backend/src/flows/chat.ts
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in TASK-10's reviews (2026-09-27). The /api/chat request is { messages: [{ role, content: string }] } (docs/contracts.md), so when Frontend resends the conversation each turn, frontend/src/lib/chat/message-text.ts keeps only text parts: an assistant message's analyze_pun tool-call parts (the analyzed text and Inference's /analyze result) are dropped, and Backend's chatInputSchema (backend/src/flows/chat.ts) couldn't accept them anyway. So on the next turn Gemini no longer knows what it analyzed or what Inference returned, and a follow-up like 'why did you say that was a pun?' loses its grounding. Persisted threads (localStorage) already store the tool-call parts, so the data exists on the Frontend side. This changes the /api/chat request contract, so both sides agree it in contracts.md first (AGENTS.md's Architectural review applies).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/contracts.md specifies how a previous turn's analyze_pun calls and results are sent in the /api/chat request, agreed by Backend and Frontend, including how older clients sending string-only content keep working
- [ ] #2 Frontend resends each earlier analyze_pun call and its result in that shape instead of dropping it, unit-tested with a history containing a completed call
- [ ] #3 Backend accepts the new shape and passes the earlier calls and results to Gemini as tool history, tested against a Genkit test-double model that receives them
- [ ] #4 A follow-up question about an earlier analysis is answered from that analysis in the running app
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
- [ ] #4 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #5 Architectural review done (this changes the /api/chat contract)
- [ ] #6 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->
