---
id: TASK-50
title: Measure gemini-3.8-flash's silences against MODEL_STALL_LIMIT_MS
status: To Do
assignee:
  - '@yaisiel.torres'
created_date: '2026-09-29 10:31'
updated_date: '2026-10-03 23:15'
labels: []
dependencies: []
references:
  - docs/experiments/task-32/README.md
  - packages/timeouts/index.js
priority: low
project: backend
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-32 checked MODEL_STALL_LIMIT_MS (30 s, packages/timeouts/index.js) against measured silences for the ladder's two Flash-Lite models only (docs/experiments/task-32/README.md): longest 14.8 s, a mid-reply pause on gemini-3.1-flash-lite. gemini-3.8-flash, the ladder's last rung, was left out because its free tier is 20 requests/day, shared with production's last rung. One limit covers every rung, and TASK-45 saw Flash go past 30 s before its first chunk on 3 attempts in a row, without telling a stall from long thinking. Until Flash is measured, the limit isn't lowered (decided with @yaisiel.torres, 2026-09-29). If Flash's normal silences are near or above 30 s, raising the limit shrinks RETRY_BUDGET_MS and lengthens MAX_SILENCE_MS: above 35 s, CLOUD_RUN_REQUEST_TIMEOUT_MS must rise in the same change, and a longer maximum silence must reach Frontend (FRONTEND_SILENCE_LIMIT_MS) first (docs/engineering-practices.md, 'Shared timeouts'). docs/experiments/task-32/measure.mjs is the harness; its MODELS and its pause (5 s, sized for Flash-Lite's 15 requests/min) need changing for Flash's 5 requests/min and daily cap, which may mean spreading runs over several days.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 gemini-3.8-flash's silences (time to first chunk, longest gap between chunks, last chunk to call end) are measured per attempt with docs/experiments/task-32/measure.mjs, stall limit raised, over TASK-38's prompt set, within Flash's free-tier limits; the run is saved and summarized in docs/experiments/task-32/README.md
- [ ] #2 MODEL_STALL_LIMIT_MS is kept or changed from the combined Flash-Lite and Flash measurements, with the margin explained next to the constant and in docs/contracts.md, and packages/timeouts/tests pass
- [ ] #3 If the value changes, CLOUD_RUN_REQUEST_TIMEOUT_MS and FRONTEND_SILENCE_LIMIT_MS are re-checked and the deploy order in docs/engineering-practices.md followed
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Not a formal dependency on TASK-32: TASK-32 stays open until TASK-16 lands (its Inference cold-start ACs), but this only needs TASK-32's harness (docs/experiments/task-32/measure.mjs) merged.

2026-09-29 (user): parked; the team's focus moved to Inference and ladder work stopped. gemini-3.8-flash, the ladder's last rung, stays unverified (docs/contracts.md says so); the ladder only reaches it after both Flash-Lite models fail. Pick this up only if Flash's place on the ladder, or a demo on Flash (TASK-37), comes back into scope.

2026-10-03 (user): archived without being done, after staying parked since 2026-09-29. Flash's place on the ladder and a demo on Flash haven't come back into scope, and work is on Inference. MODEL_STALL_LIMIT_MS stays at 30 s and isn't lowered, since gemini-3.8-flash's silences are unmeasured; docs/experiments/task-32/measure.mjs (MODELS and its pause adjusted for Flash's limits) measures them if Flash's rung or the limit comes up again.
<!-- SECTION:NOTES:END -->
