---
id: TASK-55
title: 'Inference: run the pun detector''s encoder on fastembed ONNX and drop torch'
status: Done
assignee:
  - '@yaisiel.torres'
created_date: '2026-10-02 10:04'
updated_date: '2026-10-03 20:57'
labels:
  - pun-classifier
milestone: m-4
dependencies:
  - TASK-16
references:
  - inference/pun_detector/features.py
  - inference/scoring.py
  - docs/experiments/pun-detector/prototype-1/report.json
project: inference
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR 85 runs all-MiniLM-L6-v2 twice in Inference: through sentence-transformers on torch for the detector, and through fastembed's ONNX export for sense selection (`scoring.default_embed`). torch, transformers and sentence-transformers grow the image, likely past Artifact Registry's 0.5 GB free tier with 3 kept versions (docs/local-setup.md), and pushed Cloud Run memory to 2 GiB. The detector feeds the raw 384-d sentence embedding into its trained classification head (`feature_vector` in pun_detector/features.py), so swapping encoders must be shown not to change predictions; the thresholds below were fixed on 2026-10-02, before running the comparison, so they cannot drift toward whatever passes. Comparing on the test split is not test-set tuning: nothing is chosen from it. Decided 2026-10-02: this blocks merging PR 85. If the gates fail, record the comparison and hand retraining to TASK-54 rather than loosening the thresholds. Following docs/local-setup.md today leaves the detector unable to load (the encoder download is only in inference/README.md, with a different WN_DATA_DIR and port), and that download step changes with this swap.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The detector and its sense selection embed with the same fastembed ONNX model scoring.py uses, and torch, transformers and sentence-transformers are gone from inference/pyproject.toml and uv.lock
- [x] #2 On the 605-item test split, ONNX and torch 3-class predictions differ on at most 1 item, and only where P(pun) is within 0.01 of the threshold or the top two classes are within 0.01 of each other
- [x] #3 Metrics recomputed from the ONNX predictions are within 0.005 of report.json, with embedding cosine similarity and the largest class-probability difference recorded alongside
- [x] #4 detector.npz's feature metadata names the new encoder, so `PunDetector`'s configuration check still rejects a mismatched artifact
- [x] #5 The image size and Cloud Run memory use are measured; `--memory` in deploy-inference.yml is set from the measurement and docs/local-setup.md's registry note is updated
- [x] #6 docs/local-setup.md's Inference section covers every one-time download the detector needs, and inference/README.md no longer carries its own local-setup steps
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Compare first, with no production code changed: docs/experiments/task-55/compare.py runs PR 85's torch FeatureExtractor and an ONNX (fastembed) variant over the 605-item test split from splits.json, and records predictions, metrics, embedding cosine and the largest class-probability difference. torch comes in only through `uv run --with`, never pyproject.toml. If a gate fails, stop and hand retraining to TASK-54.
2. If the gates pass: the detector and select_senses embed through scoring.default_embed (one shared model instance); drop torch, transformers, sentence-transformers and the PyTorch index from pyproject.toml and uv.lock; drop the Hugging Face snapshot step and PUN_RESOURCES from the Dockerfile.
3. detector.npz: rewrite only its metadata (decided with Yai 2026-10-02, option a) so features.encoder names the ONNX model and points to docs/experiments/task-55 as the equivalence evidence; verify mean, scale, coef, intercept and classes are byte-identical.
4. Build PR 85's image and the ONNX image locally; record both image sizes and container memory after one prediction; set --memory in deploy-inference.yml from the measurement.
5. Docs: local-setup.md's Inference section lists every one-time download; inference/README.md drops its own setup steps; the registry-size note is updated.
6. Code review by a subagent per AGENTS.md, then open the PR into Groverpr93:review/pun-detector (PR 85's branch).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in Groverpr93/pun-analysis-agent#1 (into PR #85's branch, merged 2026-10-03 18:23 UTC), which landed on main with PR #85 as 2e93091. docs/experiments/task-55/compare.py ran PR #85's torch encoder and the fastembed ONNX one over the 605-item test split, with torch brought in only through uv run --with. Gates (fixed 2026-10-02, before the first run) all passed: 0 of 605 predictions differ; every metric matches report.json (largest gap 2.2e-16); the torch run reproduces the stored predictions 605 of 605. Across the 9,911 texts embedded, the lowest cosine between the two encoders was 0.9999998 and the largest class-probability difference was 1.8e-6. No retraining was needed. detector.npz keeps byte-identical weights; only its metadata changed (features.encoder = fastembed:all-MiniLM-L6-v2, plus encoder_history naming the torch encoder and docs/experiments/task-55 as the equivalence evidence).

Measured locally on linux/amd64: compressed image 768 MB (PR #85 with torch) -> 350 MB (same as main before #85); peak memory on dense 2,000-character texts 1,765 MiB -> 524-601 MiB, so deploy-inference.yml's --memory went from 2 GiB to 1 GiB. EMBED_BATCH_SIZE is 8 because fastembed's default of 256 pads a batch to its longest text: one 2,000-character text peaked at 1,155 MiB at the default (found by the independent review, fixed and re-measured). fastembed pins no model revision, so the Dockerfile's last build step also checks the baker sentence's confidence (0.94911 +/- 1e-4) to catch drift. Tests added: test_artifact_matches_the_encoder_the_detector_runs_on, test_onnx_embed_returns_unit_length_float32_rows_in_order (also pins the small batch size).

Verified 2026-10-03 on main (2e93091): uv run pytest 55 passed; torch, transformers and sentence-transformers are absent from inference/pyproject.toml and uv.lock; deploy-inference.yml sets --memory=1Gi and the post-merge Deploy Inference run succeeded.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The pun detector now embeds through the fastembed ONNX all-MiniLM-L6-v2 that sense scoring already loads, and torch, transformers and sentence-transformers are gone, so Inference holds one copy of the model. Verified with docs/experiments/task-55: 0 of 605 test predictions changed, metrics identical to report.json, encoder cosine >= 0.9999998, so detector.npz kept byte-identical weights and only its encoder metadata changed. Image 768 -> 350 MB and peak memory 1,765 -> about 600 MiB, so Cloud Run memory is 1 GiB. Docs: local-setup.md lists every one-time download; inference/README.md no longer has its own setup. Landed via Groverpr93/pun-analysis-agent#1 inside PR #85 (2e93091); 55 inference tests pass and the post-merge deploy succeeded.
<!-- SECTION:FINAL_SUMMARY:END -->
