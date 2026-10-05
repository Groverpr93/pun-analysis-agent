---
id: TASK-15
title: 'Export conversation as JSON, and reset controls'
status: To Do
assignee:
  - '@yaitorr'
created_date: '2026-09-18 00:02'
updated_date: '2026-10-04 20:57'
due_date: '2026-09-21'
labels: []
milestone: m-1
dependencies:
  - TASK-6.1
  - TASK-6.3
references:
  - docs/design/frontend-design.md
  - docs/contracts.md
priority: medium
project: frontend
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docs/design/frontend-design.md's 'Chat' component section specifies exporting the conversation to clipboard as JSON (for Data/Eval's full-pipeline explanation-quality evaluation per docs/project-spec.md) or resetting it, independent of the localStorage persistence layer — read directly off the runtime's live message state, not the persisted thread history. This is already in-scope per that doc but wasn't tracked as a task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A visible action copies the current thread's live runtime message state (not the persisted localStorage copy) to the clipboard as JSON
- [ ] #2 JSON shape: {exportedAt: ISO 8601 string, threadId: string, messages: [{role: 'user'|'assistant', content: [{type:'text', text} | {type:'tool-call', toolCallId, toolName, args, result}]}]}, where a tool-call part's result reuses docs/contracts.md's /analyze response schema verbatim rather than redefining it
- [ ] #3 Exporting a Phase-1-only thread (text-only parts, per docs/design/frontend-design.md's schema-drift note) produces valid JSON with text-only content parts and no tool-call parts
- [ ] #4 Exporting a thread containing a resolved analyze_pun tool call includes that call's args and result verbatim
- [ ] #5 A reset action clears the current thread's runtime state back to the greeting state, independent of the export action and of the persistence layer
- [ ] #6 Both actions are unit-tested against TASK-6.3's stub fixtures (Phase 1 text-only and Phase 2 tool-call shapes), no live backend required
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->
