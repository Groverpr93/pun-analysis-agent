---
id: TASK-45
title: 'Backend: check chat continuity across the model ladder''s models'
status: To Do
assignee: []
created_date: '2026-09-28 19:54'
labels: []
dependencies:
  - TASK-43
references:
  - docs/contracts.md
  - backend/src/flows/model-ladder.ts
  - backend/src/config.ts
  - docs/experiments/task-38/README.md
priority: medium
type: task
project: backend
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-43 made /api/chat step down a ladder of models (gemini-flash-lite-latest -> gemini-3.1-flash-lite -> gemini-2.5-flash-lite) when one fails. Within a reply the model is pegged, so the thought signatures Gemini checks on that reply's own tool calls always come from the model that made them. Across replies nothing pins the model: a follow-up can be answered by a different model than the one that made the earlier reply's analyze_pun calls, and Frontend resends those calls as history without their signatures (docs/contracts.md, "No thought signatures"). TASK-35 confirmed that Gemini accepts unsigned resent calls, but only against gemini-flash-lite-latest. Nobody has checked whether the two lower models accept another model's unsigned history, or that they answer with this project's API key at all (gemini-2.5-flash-lite is access-restricted to projects that used it before). If either fails, a follow-up that steps down fails instead of being rescued.

Timing measurements for these models stay in TASK-32 (AC #4). This task is only about whether a conversation keeps working when the model changes between replies.

Useful context: TASK-35 checked with a scratch script against real Gemini; TASK-38's P4 -> P5 prompt pair (docs/experiments/task-38/) has the shape needed, a reply with analyze_pun calls followed by a follow-up about them. Setting GEMINI_MODEL on a local Backend limits /api/chat to one model, which forces a given turn onto a given model. Quota is per model on the free tier, so this spends the lower models' quota, not production's.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 gemini-3.1-flash-lite and gemini-2.5-flash-lite each answer a plain /api/chat request made with this project's API key, with the date and result recorded
- [ ] #2 A follow-up whose history holds analyze_pun calls and results made by gemini-flash-lite-latest, resent without thought signatures as Frontend sends them, is accepted by each lower model and answered from the resent result
- [ ] #3 The reverse also holds: a follow-up to a reply made by a lower model is accepted by gemini-flash-lite-latest
- [ ] #4 Both kinds of ref are covered: a Gemini-supplied call id and a Backend-numbered one ("0")
- [ ] #5 docs/contracts.md's "No thought signatures" bullet records the models checked and drops its "not yet" wording; if a model rejects the history, what happens to the follow-up is recorded there and a fix is agreed with the user before this task closes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->
