---
id: TASK-49
title: 'Backend: a shorter stall limit once a model call has started streaming'
status: To Do
assignee: []
created_date: '2026-09-29 09:57'
labels: []
dependencies:
  - TASK-32
references:
  - packages/timeouts/index.js
  - backend/src/flows/stall-guard.ts
  - docs/contracts.md
  - docs/engineering-practices.md
priority: low
type: enhancement
project: backend
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Since TASK-42, one limit (MODEL_STALL_LIMIT_MS, 30 s since TASK-44) bounds every silence in a model call: the wait for its first chunk, the gaps between chunks, and the time after its last chunk until the call ends. Only the first of those needs to be long, since it covers the model's thinking; once a call is streaming, gaps are normally short. Using the long limit for all of them is costly because TASK-44's worst case counts two stall limits per model call (first chunk and tail), and the tail is also half of MAX_SILENCE_MS. At 3 tool rounds that makes the baseline worst case 300 s, which is why Cloud Run's timeout was raised to 400 s, and it leaves little headroom: the stall limit can't grow past about 35 s without raising Cloud Run's timeout again, which a slower thinking model such as Flash (TASK-37) may need. A shorter limit for silence after the first chunk would shrink the baseline, MAX_SILENCE_MS and, in turn, the Frontend silence limit (TASK-28). TASK-32 AC #4 measures time to first chunk and the longest gap between chunks, which this needs to set both values.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A model call's wait for its first chunk and its silence after its first chunk (between chunks, and after the last until the call ends) have separate named limits in @pun-agent/timeouts, each set from TASK-32's measurements with its margin explained next to it
- [ ] #2 MAX_SILENCE_MS and BASELINE_REPLY_WORST_CASE_MS use the right limit for each gap, and the relationship tests, including the gap-by-gap walk, still fail if a term is dropped
- [ ] #3 Stall-guard tests fail if a gap after the first chunk is held to the first-chunk limit, or the first chunk to the shorter one
- [ ] #4 CLOUD_RUN_REQUEST_TIMEOUT_MS, FRONTEND_SILENCE_LIMIT_MS and the retry budget are revisited with the room freed, and any lowering of Frontend's limit ships only after Backend's shorter silence is deployed (docs/engineering-practices.md, 'Shared timeouts')
- [ ] #5 docs/contracts.md describes both limits
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->
