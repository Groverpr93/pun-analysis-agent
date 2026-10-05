---
id: TASK-54
title: 'Inference: commit the pun detector''s training scripts and tests'
status: To Do
assignee:
  - '@Groverpr93'
created_date: '2026-10-02 10:04'
updated_date: '2026-10-04 20:56'
labels:
  - pun-classifier
milestone: m-6
dependencies:
  - TASK-16
references:
  - docs/experiments/pun-detector/prototype-1/README.md
priority: medium
project: inference
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR 85 added `inference/pun_detector/detector.npz` and the prototype-1 report, splits and test predictions under docs/experiments/pun-detector/prototype-1, but inference/README.md says the training scripts and prototype tests are kept locally. Without them nobody else can reproduce or retrain the detector, for example if swapping its encoder to ONNX changes predictions, and the detector's own logic has no tests in the repo.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The script(s) that produce detector.npz and the prototype-1 report are committed and run with uv from the repo
- [ ] #2 Re-running training on splits.json reproduces the metrics in report.json
- [ ] #3 `pun_detector/` has tests for `choose_label`'s threshold and type choice and for `PunDetector`'s artifact checks, runnable without downloaded models
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->
