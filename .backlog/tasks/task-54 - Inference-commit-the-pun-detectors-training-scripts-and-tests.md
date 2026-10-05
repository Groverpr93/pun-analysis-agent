---
id: TASK-54
title: 'Inference: commit the pun detector''s training scripts and tests'
status: Done
assignee:
  - '@Groverpr93'
created_date: '2026-10-02 10:04'
updated_date: '2026-10-05 00:08'
labels:
  - pun-classifier
milestone: m-6
dependencies:
  - TASK-16
references:
  - docs/experiments/pun-detector/prototype-1/README.md
project: inference
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR 85 added `inference/pun_detector/detector.npz` and the prototype-1 report, splits and test predictions under docs/experiments/pun-detector/prototype-1, but inference/README.md says the training scripts and prototype tests are kept locally. Without them nobody else can reproduce or retrain the detector, for example if swapping its encoder to ONNX changes predictions, and the detector's own logic has no tests in the repo.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The script(s) that produce detector.npz and the prototype-1 report are committed and run with uv from the repo
- [x] #2 Re-running training on splits.json reproduces the metrics in report.json
- [x] #3 `pun_detector/` has tests for `choose_label`'s threshold and type choice and for `PunDetector`'s artifact checks, runnable without downloaded models
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Restore the original trainer with saved split IDs and explicit training dependencies; adapt detector unit tests to current ONNX inference; reproduce the recorded metrics and document presentation commands; commit only TASK-54 changes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fresh original torch feature extraction and saved-split training reproduced all five report structures at absolute tolerance 1e-9. Cached rerun also passed. 113 inference tests passed. Independent code/architecture review found no blockers. Optional training deps excluded from production export; generated output excluded from Git/Docker. Source commit 558ed27; reproduction documentation follows in a separate commit.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Committed trainer with recorded split validation, pinned offline training dependencies, report verification and model-free detector tests. Full training reproduces prototype-1 metrics for presentation; no shipped weights changed.
<!-- SECTION:FINAL_SUMMARY:END -->
