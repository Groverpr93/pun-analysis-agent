---
id: TASK-46
title: 'Backend: record gemini-3.8-flash answering a follow-up made by another model'
status: To Do
assignee:
  - '@yaisiel.torres'
created_date: '2026-09-29 08:53'
updated_date: '2026-09-29 10:42'
labels: []
dependencies:
  - TASK-45
references:
  - docs/experiments/task-45/README.md
  - docs/contracts.md
priority: low
type: task
project: backend
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-45 checked that each model on /api/chat's ladder accepts a follow-up whose analyze_pun history (resent without thought signatures, docs/contracts.md) was made by another model. gemini-3.5-flash-lite and gemini-3.1-flash-lite did. gemini-3.8-flash, the ladder's last rung, never answered in TASK-45's recorded runs (2026-09-28/29): every request failed as UNAVAILABLE, RESOURCE_EXHAUSTED or DEADLINE_EXCEEDED, never INVALID_ARGUMENT, which is what a rejected history would get. contracts.md records it as unverified. It only matters once both Flash-Lite models have failed a follow-up, when a rejection would fail a reply that was failing anyway, hence the low priority. The local key is in the pun-agent project, so a run spends production's quota, including Flash's 20 requests/day that production keeps as its last resort: probe Flash with one plain request first, and run when production doesn't need it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/experiments/task-45/check.mjs has been run with gemini-3.8-flash answering both of its follow-ups (Gemini-supplied ref and "0"), and the run is saved under docs/experiments/task-45/runs/
- [ ] #2 docs/contracts.md's "No thought signatures" bullet and docs/experiments/task-45/README.md record gemini-3.8-flash as checked, with the date; if it rejected the history, what that does to a follow-up is recorded and a fix agreed with the user
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-29 (user): parked; the team's focus moved to Inference and ladder work stopped. gemini-3.8-flash, the ladder's last rung, stays unverified (docs/contracts.md says so); the ladder only reaches it after both Flash-Lite models fail. Pick this up only if Flash's place on the ladder, or a demo on Flash (TASK-37), comes back into scope.
<!-- SECTION:NOTES:END -->
