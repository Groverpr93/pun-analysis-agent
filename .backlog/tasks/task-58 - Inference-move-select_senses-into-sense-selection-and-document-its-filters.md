---
id: TASK-58
title: 'Inference: move select_senses into sense selection and document its filters'
status: To Do
assignee: []
created_date: '2026-10-03 21:30'
labels:
  - wsd
milestone: m-6
dependencies: []
references:
  - inference/pun_detector/agent.py
  - docs/design/sense-selection.md
  - inference/scoring.py
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR #85 wired sense selection's steps (candidates, context, senses, scoring) together for the first time, but did it inside the detector package: pun_detector/agent.py's select_senses imports internals of all four modules, including GLOSS_DISTINCT_THRESHOLD, and is now the only code that runs the Tier 0-2 pipeline in production. It also applies filters that docs/design/sense-selection.md doesn't describe: it rejects a pair whose runner-up score is <= 0, a pair whose two WordNet senses share an alternative lemma (shares_alternative_lemma), and any pair whose glosses are too similar (GLOSS_DISTINCT_THRESHOLD, applied to every pair, not only when lexfiles can't tell); and it tries candidates in the detector's ranking and returns the first that passes. Consequences found in PR #85's architectural review (2026-10-03, recorded on TASK-16): whoever works on sense selection or TASK-21 won't find the orchestrator where the design says it is, a change to scoring.py can break the detector package, and calibration that rebuilds the pipeline from the parts (PR #89's inference/scripts/calibrate_margin.py measures pun_margin alone) measures something production doesn't run, so a calibrated MARGIN_THRESHOLD can't be trusted until it goes through the same function. TASK-21 owns the explanation template and final tiering; this task is only about where the orchestration lives and what the design doc says it does.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The Tier 0-2 orchestration (today select_senses and shares_alternative_lemma in pun_detector/agent.py) lives in a top-level sense-selection module, and pun_detector imports only its public function, no other sense-selection internals
- [ ] #2 docs/design/sense-selection.md describes every filter that function applies and how it chooses among candidates, or the code drops a filter the team decides against
- [ ] #3 Calibration and evaluation code can call that same function on a sentence and get the pair (or no pair) production would, so a threshold is measured on what production runs
- [ ] #4 Each filter has a unit test that fails when the filter is removed, and tests/test_pun_analysis.py passes unchanged
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->
