---
id: TASK-51
title: 'Inference: load the pun detector at startup and expose a health check'
status: To Do
assignee:
  - '@yaisiel.torres'
created_date: '2026-10-02 10:04'
updated_date: '2026-10-03 21:31'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-03: PR #90 (68ab1f3) already covers most of AC #3: tests/test_main.py swaps in a fake PunAnalysis and checks blank and over-MAX_CHARS text get 422 and that the undetermined, not-a-pun, llm_fallback, wordnet and wiktionary results all come back unchanged. Still missing: a result that breaks AnalyzeResponse gets a 500. Also from PR #85's architectural review: pun_detector/features.py's FeatureExtractor loads its own en_core_web_sm with disable=['ner'], the same settings as candidates.get_model(), so Inference holds two copies of the spaCy pipeline inside its 1 GiB; its comment saying the other one disables the parser is wrong. Reuse candidates.get_model() when moving loading to startup.
<!-- SECTION:NOTES:END -->
