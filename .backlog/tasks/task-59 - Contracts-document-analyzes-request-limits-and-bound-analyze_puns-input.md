---
id: TASK-59
title: 'Contracts: document /analyze''s request limits and bound analyze_pun''s input'
status: To Do
assignee: []
created_date: '2026-10-03 21:30'
labels: []
milestone: m-4
dependencies: []
references:
  - docs/contracts.md
  - inference/main.py
  - backend/src/tools/analyze-pun.ts
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR #85 made Inference's AnalyzeRequest reject blank text and text over pun_detector.features.MAX_CHARS (2,000 characters) with a 422, but docs/contracts.md still documents the request as just { "text": string }, and Backend's analyzePunInputSchema has no bound. So when Gemini calls analyze_pun on a long pasted passage, Inference answers 422, Backend logs it as an ordinary non_2xx failure and returns the undetermined result, and nobody can tell a limit from an outage; Eval counts it as a request error. Found in PR #85's architectural review (2026-10-03, recorded on TASK-16). This is a contract change, so it needs the architectural review AGENTS.md asks for.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/contracts.md's /analyze request states the limits Inference enforces (non-blank, at most 2,000 characters) and its 422 response
- [ ] #2 Backend's analyze_pun input schema rejects text over the limit before calling Inference, so the tool call fails as invalid input instead of becoming an undetermined result logged as non_2xx
- [ ] #3 Tests on each side pin the same limit, so changing it on one side alone fails a test
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->
