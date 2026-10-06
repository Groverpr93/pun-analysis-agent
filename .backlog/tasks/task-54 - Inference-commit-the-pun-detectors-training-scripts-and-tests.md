---
id: TASK-54
title: 'Inference: commit the pun detector''s training scripts and tests'
status: Done
assignee:
  - '@Groverpr93'
created_date: '2026-10-02 10:04'
updated_date: '2026-10-06 01:06'
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

Review follow-up (316b14c): the trainer recorded the ONNX encoder in detector.npz's features while extracting with torch, so PunDetector's configuration check accepted weights with no parity evidence. Training now uses the runtime fastembed (ONNX) FeatureExtractor and the training group (torch, sentence-transformers, transformers) is removed. A fresh ONNX run reproduced every report metric, confusion matrix, selected C and all 605 test predictions; thresholds moved at most 2.9e-5 and weights at most 2.2e-5, so --verify-reference allows 1e-4 on thresholds only. Added a train() round-trip test; 114 inference tests pass.

Review comments addressed: split_rows regenerates splits.json exactly (now tested); artifacts and the feature cache record the resolved ONNX export (encoder_revision), since fastembed doesn't pin it and it moved from 8f518e88 (TASK-55) to d1395466 on 2026-09-30; --verify-reference also compares test_predictions.jsonl. A fresh run on d1395466 reproduced every metric and all 605 predictions; 116 inference tests pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Committed trainer with recorded split validation, report verification and model-free detector tests. Training embeds with the deployed fastembed (ONNX) encoder, so retrained artifacts record the encoder they were trained on and need no PyTorch; retraining reproduces prototype-1's metrics and predictions for the presentation. No shipped weights changed.
<!-- SECTION:FINAL_SUMMARY:END -->
