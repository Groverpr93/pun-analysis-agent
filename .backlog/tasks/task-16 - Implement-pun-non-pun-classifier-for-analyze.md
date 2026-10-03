---
id: TASK-16
title: Implement pun/non-pun classifier for /analyze
status: Done
assignee:
  - '@Groverpr93'
created_date: '2026-09-18 15:51'
updated_date: '2026-10-03 21:31'
labels:
  - pun-classifier
dependencies:
  - TASK-1
references:
  - docs/experiments/pun-detector/prototype-1/README.md
  - inference/pun_detector
  - docs/experiments/task-55/README.md
  - docs/contracts.md
project: inference
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Detection component of the Inference service per docs/milestones/milestone-3.md: classify whether input text contains a pun, and if so whether it is homographic or homophonic (pun_type), feeding the is_pun/pun_type/confidence fields of the /analyze response defined in docs/contracts.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When is_pun is true, pun_type is classified as homographic or homophonic
- [x] #2 confidence is the classifier's probability that the text is a pun (docs/contracts.md); detection alone sets is_pun, pun_type and confidence, and sense selection never changes them
- [x] #3 Given input text, returns is_pun true/false per docs/contracts.md's /analyze schema, or null (with null pun_type and confidence) when it can't judge the text
- [x] #4 inference/main.py's AnalyzeResponse widens is_pun to bool | None and confidence to float | None, and adds sense_source typed to exactly docs/contracts.md's values or None (all required but nullable, no defaults). sense_source is null when is_pun is false or null. When is_pun is true, it is sense selection's tier (wordnet or wiktionary, with its explanation) for a homographic pun sense selection can explain, and llm_fallback with an empty explanation otherwise, which includes every homophonic pun. Tests cover the undetermined case and every sense_source value, so FastAPI's response_model neither turns an undetermined result into a 500 nor silently drops sense_source
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
As built (PR #85, with TASK-55's encoder swap from Groverpr93/pun-analysis-agent#1):

1. Train offline a 3-class logistic-regression head (non_pun, homographic, homophonic) over all-MiniLM-L6-v2 sentence embeddings plus WordNet sense-pair features, on eval/datasets/semeval2017_task7_puns.csv (2,818 train / 604 dev / 605 test, seed 42; C and the P(pun) threshold chosen on dev). Ship only the weights, as a pickle-free inference/pun_detector/detector.npz loaded with NumPy.
2. pun_detector/features.py builds the features (spaCy candidates, OEWN 2025 senses, embeddings); model.py's choose_label sets is_pun when P(homographic) + P(homophonic) >= 0.3203, pun_type to the likelier pun class, and confidence to that P(pun).
3. pun_detector/agent.py's PunAnalysis runs sense selection (TASK-17 to TASK-19) only for homographic puns, and only to fill words_involved, explanation and sense_source. Homophonic puns, and homographic ones selection can't explain, get llm_fallback with an empty explanation. Any detection failure returns the undetermined result.
4. main.py's AnalyzeResponse follows docs/contracts.md: nullable is_pun and confidence, sense_source, and the new probabilities field, which contracts.md now documents.
5. The detector embeds through the fastembed ONNX model scoring.py already loads (TASK-55), shown to give the same predictions on the test split.
6. The Dockerfile's last build step runs the detector on a known pun and checks its confidence for drift; deploy-inference.yml sets 1 GiB.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered (2026-10-03) by PR #85 (Prateek Grover), merged as 2e93091, which also made TASK-11's swap. TASK-55's encoder swap was merged into PR #85's branch first (Groverpr93/pun-analysis-agent#1). The plan above replaces the original one (a heuristic baseline, with pronouncing/CMUdict for homophones): the homophonic type comes from the trained classifier, so pronouncing was never added. The original step 7 (who owns confidence) was settled in docs/contracts.md: confidence is the detector's P(pun), and sense selection never changes is_pun, pun_type, confidence or probabilities.

Held-out results (605-item test set of the project's own split, not the official SemEval one; docs/experiments/pun-detector/prototype-1): pun precision 85.7%, recall 94.4%, F1 89.9%; binary accuracy 84.8%; 3-class accuracy 63.3%, macro F1 63.6%. Known limitations from the report: it over-predicts puns (68 of 173 non-puns flagged), it confuses the two pun types, embedding-only scored a higher test pun F1 (91.1%) than the shipped combined model, probabilities are not calibrated, and the test set has been inspected, so further tuning needs a fresh held-out set.

TASK-55 (Groverpr93/pun-analysis-agent#1): with the ONNX encoder, 0 of 605 test predictions changed, metrics are identical, and the weights are byte-identical. The image shrank from 768 to 350 MB, and deploy memory dropped from 2 GiB to 1 GiB.

Verified 2026-10-03 on main (2e93091): uv run pytest 55 passed; ruff clean. Local /analyze runs, offline: 'The meeting starts at nine.' -> is_pun false, confidence 0.051. 'The baker needed more dough.' -> homographic, 0.949, wordnet, ['dough']. 'Seven days without a pun makes one weak.' -> homophonic, 0.596, llm_fallback, empty explanation and words. A detector that raises -> the undetermined result. Also observed: 'She rolled the dough flat.' -> pun at 0.54 (a false positive); 'I used to be a banker but I lost interest.' -> words_involved ['lost'], not 'interest'; 'two-tired' typed homographic. Production has had no /analyze traffic yet (TASK-11 AC #2).

Still open: AC #2 and #4 need tests. test_main.py only checks that the response has the probabilities and sense_source keys; nothing exercises PunAnalysis's branches (undetermined, each sense_source value, sense selection leaving the verdict alone). AC #4's interim wording ("llm_fallback with an empty explanation until TASK-21") no longer matches homographic puns, which already get a local WordNet/Wiktionary explanation. Follow-ups from PR #85's review: TASK-51 (load at startup, health check), TASK-52 (auth hardening), TASK-53 (warm-up), TASK-54 (training scripts, detector tests), TASK-56 (system instruction), TASK-57 (card).

Tests for AC #2 and #4 (2026-10-03): PR #90 (task-16-pun-analysis-tests) adds tests/fakes.py and tests/test_pun_analysis.py, and replaces test_main.py's key-presence test. With a fake detector and selector, they cover the undetermined result, a non-pun staying is_pun false, homophonic -> llm_fallback, homographic -> wordnet/wiktionary or llm_fallback (top candidate, or none), sense selection never changing is_pun/pun_type/confidence/probabilities, and /analyze returning every shape unchanged through AnalyzeResponse. 71 inference tests pass; 9 deliberate breaks in agent.py and main.py each fail at least one test.

AC #4 reworded (2026-10-03, decided with Yai): it said sense_source stays llm_fallback with an empty explanation 'until TASK-21 lands', but PR #85 already runs local sense selection (TASK-17 to TASK-19) for homographic puns, so those get wordnet or wiktionary with an explanation when selection finds a confident pair. The new wording describes what shipped; TASK-21 still owns the explanation template and the final tiering. Assigned to Prateek (@Groverpr93), who wrote the classifier and PR #85.

Architectural review of PR #85 (2026-10-03, subagent per AGENTS.md, checked against main 2e93091): the service boundaries hold. Inference and Backend import nothing from each other; the ID-token audience comes from the same INFERENCE_URL origin createInferenceFetch is restricted to, so either run.app URL form works; Backend enforces the probabilities rules (sum within 1e-6, confidence = homographic + homophonic); Zod strips unknown keys, so engineering-practices.md's consumer-first deploy order wasn't broken. Findings outside this task's criteria, re-checked by hand: (1) the detector was trained on eval/datasets/semeval2017_task7_puns.csv (manifest dataset_sha256 = the file's sha256; 2,820 rows in train) while eval/evaluate_dataset.py scores every row, so Eval's next /analyze run and TASK-2.4's calibration would report inflated metrics unless they use the test split only; (2) select_senses, the only Tier 0-3 orchestration, lives in pun_detector/agent.py and adds gates docs/design/sense-selection.md doesn't describe (runner-up score > 0, shares_alternative_lemma, a second gloss-distinctness check, homographic only); (3) /analyze's 422 limits (blank, over 2,000 characters) aren't in docs/contracts.md, and Backend's input schema has no bound; (4) parallel analyze_pun calls queue on one instance with concurrency 1 under one 20 s timeout each (for TASK-32); (5) Backend's deploy now needs the Inference service to exist (TASK-52 covers the empty URL); (6) FeatureExtractor loads a second en_core_web_sm with the same settings as candidates.get_model(), and its comment saying the other one disables the parser is wrong; (7) stale 'until TASK-11' / 'blocked on TASK-16' text in frontend fixtures, eval/README.md and eval/reports, and Eval's validate_response ignores probabilities; (8) sense selection doesn't log why it fell back, which sense-selection.md asks for.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
PR #85 (Prateek, 2e93091) shipped the detector: a 3-class logistic-regression head over all-MiniLM-L6-v2 embeddings and WordNet sense features, trained on the SemEval 2017 Task 7 file and run through fastembed's ONNX encoder (TASK-55). It sets is_pun when P(homographic) + P(homophonic) >= 0.3203, pun_type to the likelier pun class, confidence to that probability, and the new probabilities field; local sense selection explains homographic puns, everything else falls back to llm_fallback, and a failure is the undetermined result. Held-out test split: pun precision 85.7%, recall 94.4%, F1 89.9%; probabilities are uncalibrated. Verified by PR #90 (68ab1f3), which tests every branch with fakes (71 inference tests; 9 deliberate breaks each fail a test), and by local runs on real sentences. AC #4 was reworded to the shipped behaviour. The architectural review found no boundary problems; its findings went to TASK-58, TASK-59 and notes on TASK-21, TASK-32, TASK-51 and TASK-52, and the training-data overlap with Eval is being raised on PR #89.
<!-- SECTION:FINAL_SUMMARY:END -->
