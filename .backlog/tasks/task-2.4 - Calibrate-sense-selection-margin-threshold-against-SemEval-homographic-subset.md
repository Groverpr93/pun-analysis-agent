---
id: TASK-2.4
title: Calibrate sense-selection margin threshold against SemEval homographic subset
status: To Do
assignee: []
created_date: '2026-09-20 10:05'
updated_date: '2026-09-29 01:58'
labels:
  - wsd
  - evaluation
milestone: m-6
dependencies:
  - TASK-1
  - TASK-19
references:
  - docs/design/sense-selection.md
parent_task_id: TASK-2
project: eval
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docs/design/sense-selection.md leaves the Tier 1 margin threshold (when two candidate senses count as close enough to signal a pun) unset until Eval runs it against real data. Use the eval dataset's homographic, is_pun:true rows to calibrate that threshold once TASK-19's scoring exists.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Margin threshold is calibrated against the homographic/is_pun:true subset of the eval dataset
- [ ] #2 The chosen threshold and calibration methodology are recorded in docs/design/sense-selection.md's open questions section
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
From TASK-19 (2026-09-28): two placeholders in inference/scoring.py need calibrating, MARGIN_THRESHOLD (0.1) and GLOSS_DISTINCT_THRESHOLD (0.5, used when lexfiles can't separate senses: Wiktionary senses and adj.all adjectives). With 0.1, polysemous verbs scored by Lesk showed margins of 0.02-0.08 in the code review's samples (need, use, lose, die, go, stand), so they'd all read as puns; the threshold likely needs to be much lower or margin-relative. /analyze doesn't expose the margin, and inference/ and eval/ are separate uv projects, so calibration needs a way to get margins out (e.g. a script in inference/ that runs the SemEval subset, or a debug field).
<!-- SECTION:NOTES:END -->
