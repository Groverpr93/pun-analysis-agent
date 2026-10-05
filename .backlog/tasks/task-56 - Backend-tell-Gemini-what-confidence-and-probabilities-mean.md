---
id: TASK-56
title: 'Backend: tell Gemini what confidence and probabilities mean'
status: To Do
assignee:
  - '@yaitorr'
created_date: '2026-10-02 10:04'
updated_date: '2026-10-04 20:57'
labels: []
milestone: m-4
dependencies:
  - TASK-16
references:
  - backend/src/flows/system-instruction.ts
priority: medium
project: backend
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
analyze_pun's output carries `confidence` and, since PR 85, `probabilities`: raw, uncalibrated detector output (docs/contracts.md). The system instruction (backend/src/flows/system-instruction.ts) never explains either, so Gemini, the Flash-Lite models especially, may present them as certainty ("the model is 93% sure"). Decided with Yai on 2026-10-02: Otto describes them in words, and the exact numbers stay in Frontend's tool-call card, which shows them next to an uncalibrated hint. TASK-20 adds a neighbouring paragraph for llm_fallback results.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The system instruction says `confidence` and `probabilities` are uncalibrated model output and tells Gemini to describe them in words, never as a percentage or a certainty
- [ ] #2 The new paragraph is consistent with TASK-20's llm_fallback guidance
- [ ] #3 A recorded check, in the style of docs/experiments/task-47, shows the production models following it on several analyzed texts, including one with an uncertain class split
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->
