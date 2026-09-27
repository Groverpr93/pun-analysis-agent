---
id: TASK-31
title: Otto the otter persona
status: To Do
assignee: []
created_date: '2026-09-27 15:02'
labels: []
milestone: m-5
dependencies: []
type: feature
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The app already looks like an otter mascot (TASK-22) but doesn't act like one: Gemini answers in a neutral general-assistant voice, and while it thinks the UI shows a generic pulsing dot. This umbrella groups the work that makes the agent consistently present as Otto, a friendly, playful anthropomorphized otter who only does pun analysis, in both what he says (backend system instruction) and how he looks while working (frontend loading state). Scope limiting itself stays with TASK-12.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Both subtasks (backend persona, frontend loading animation) are Done
- [ ] #2 In a manual end-to-end check against the deployed or local app, Otto's voice in replies and the thinking animation read as the same character as the TASK-22 mascot
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->
