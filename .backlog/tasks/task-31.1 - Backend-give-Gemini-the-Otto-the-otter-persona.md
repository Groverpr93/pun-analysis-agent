---
id: TASK-31.1
title: 'Backend: give Gemini the Otto the otter persona'
status: To Do
assignee: []
created_date: '2026-09-27 15:02'
updated_date: '2026-09-28 11:28'
labels: []
milestone: m-5
dependencies:
  - TASK-12
references:
  - backend/src/flows/chat.ts
  - docs/project-spec.md
parent_task_id: TASK-31
type: feature
project: backend
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-12 limits Gemini to pun analysis, but nothing defines who is talking, so replies come in a neutral voice that clashes with the otter branding (TASK-22). This task gives the system instruction a character: Otto, a friendly, playful otter. Ownership inside the shared system instruction: TASK-12 owns the scope/redirect rules and the analyze_pun consultation rule, TASK-20 owns the llm_fallback paragraph, and this task owns character and voice. The persona applies to the whole conversation. There is deliberately no model-generated opening greeting, since the static frontend welcome costs no Gemini call (AGENTS.md Performance). Depends on TASK-12 because that task establishes the system instruction this one extends.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The system instruction presents the assistant as Otto, an anthropomorphized otter with a friendly, playful voice, and Otto introduces himself by that name when asked who he is
- [ ] #2 The persona is consistent with the TASK-22 mascot and copy (Purdue black/gold hoodie, glasses, the "That's punny!" catchphrase)
- [ ] #3 The instruction tells Otto to use otter-specific flavor (e.g. floating on his back, cracking a pun open like a shellfish on a rock, stashing favorite puns like pet rocks) sparingly, so it never replaces or obscures the actual pun analysis
- [ ] #4 Off-topic requests are redirected back to puns in character, without overriding or loosening TASK-12's scope rules
- [ ] #5 The persona lives only in Backend's system instruction: no /api/chat contract change and no extra Gemini call per session
- [ ] #6 A Backend test against a Genkit test double asserts the persona text is part of the system instruction the model receives
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @yaisiel.torres
created: 2026-09-28 11:28
---
Open question from TASK-12 (PR #64): is writing new puns in scope? TASK-12's system instruction (backend/src/flows/system-instruction.ts) covers analyzing puns and wordplay and redirects anything else, but it doesn't say whether the assistant may write puns (e.g. "tell me a pun about otters"). As written, Gemini decides for itself.
- Allow: fits Otto's playful voice and the "That's punny!" catchphrase, and people will likely ask a pun-themed mascot for one.
- Disallow: keeps replies to analysis, so eval runs (TASK-12's original motivation) aren't mixed with generated puns.
Decide before or as part of this task. The rule itself belongs in TASK-12's scope paragraph, so whoever picks this up should update that paragraph and keep its redirect behavior.
---
<!-- COMMENTS:END -->
