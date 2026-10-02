---
id: TASK-51
title: 'Inference: load the pun detector at startup and expose a health check'
status: To Do
assignee:
  - '@yaisiel.torres'
created_date: '2026-10-02 10:04'
labels: []
milestone: m-4
dependencies:
  - TASK-16
references:
  - docs/contracts.md
  - inference/main.py
  - inference/pun_detector/agent.py
project: inference
ordinal: 47000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR 85 (TASK-16) loads the detector lazily inside the first /analyze request, under PunAnalysis's lock. With --min-instances=0, that request pays the whole model load inside Backend's INFERENCE_TIMEOUT_MS. A failed load leaves the detector unset, so every later request retries the full load, and a broken artifact only shows up as undetermined results instead of failing the revision. Loading at startup does not by itself make the first request after scale-to-zero faster (that request is what starts the container); it fails broken deploys fast and gives Backend's warm-up ping a cheap endpoint that answers only once the model is ready. `inference/tests/test_main.py` currently only checks response keys and passes even when the model cannot load. Reviewed with Yai on 2026-10-02.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The detector and its resources load once at service startup, before the service accepts requests; a load failure stops startup instead of degrading every request to the undetermined result
- [ ] #2 `GET /health` answers 200 only once the detector is loaded, without running a prediction, and docs/contracts.md documents it
- [ ] #3 `test_main.py` injects a fake analysis and checks that blank and over-`MAX_CHARS` text get 422, determined and undetermined results serialize to the /analyze shape, and a result that breaks `AnalyzeResponse` gets 500
- [ ] #4 `PunAnalysis` has tests with a fake detector and selector: a homophonic pun skips sense selection, a selector failure leaves `sense_source` as llm_fallback, and a detection failure returns the undetermined result
- [ ] #5 docs/local-setup.md describes startup loading and the health check
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->
