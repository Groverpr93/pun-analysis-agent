---
id: TASK-32
title: 'Backend: set analyze_pun''s Inference timeout from a measured cold start'
status: To Do
assignee:
  - '@yaisiel.torres'
created_date: '2026-09-27 15:25'
updated_date: '2026-09-27 16:08'
labels: []
milestone: m-4
dependencies:
  - TASK-9
  - TASK-14
references:
  - docs/contracts.md
  - backend/src/tools/analyze-pun.ts
project: backend
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-9 added INFERENCE_TIMEOUT_MS (backend/src/tools/analyze-pun.ts) with a provisional, unmeasured 20 s, because Inference wasn't deployed yet (deploy-inference.yml was a placeholder until TASK-14). The value bounds how long a turn waits on analyze_pun before Backend falls back to the undetermined /analyze result, and Frontend relies on it as the worst-case wait (TASK-10 AC #8, TASK-28). Too low and every cold start degrades to 'undetermined'; too high and a dead Inference stalls every pun question. Carries TASK-9's AC #5, which stayed open.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Inference's cold start on Cloud Run is measured on the deployed service (time to first successful /analyze after scale-to-zero), over several runs, with the method recorded
- [ ] #2 INFERENCE_TIMEOUT_MS is set from that measurement with its margin explained next to the constant
- [ ] #3 docs/contracts.md records the measured value and drops the 'provisional and unmeasured' wording, so Frontend can rely on the worst-case wait
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Carries TASK-9's former AC #5, removed from TASK-9 on 2026-09-27: 'The Inference timeout is a named constant whose value is based on a measured Inference cold start on Cloud Run ... and the value and measurement are recorded in docs/contracts.md so Frontend can rely on the worst-case wait.' The constant already exists (INFERENCE_TIMEOUT_MS, backend/src/tools/analyze-pun.ts); contracts.md also states the per-reply worst case (up to 5 rounds x the timeout), which must be updated with the measured value.
<!-- SECTION:NOTES:END -->
