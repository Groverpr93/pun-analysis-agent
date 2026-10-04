---
id: TASK-2.3
title: Build precision/recall evaluation harness for /analyze
status: Done
assignee:
  - Livia
created_date: '2026-09-20 10:05'
updated_date: '2026-10-04 04:20'
labels:
  - dataset
  - evaluation
milestone: m-6
dependencies:
  - TASK-9
  - TASK-16
references:
  - docs/contracts.md
parent_task_id: TASK-2
project: eval
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Milestone-3.md assigns Data/Eval 'precision/recall on detection' as an ongoing responsibility once Inference has something to evaluate. Build the harness that runs the eval dataset through /analyze and scores it, respecting TASK-2.1's fix that pun_type is only meaningful (non-null) on is_pun:true rows.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Harness calls /analyze for each dataset row via TASK-9's injectable client pattern and records is_pun/pun_type predictions
- [x] #2 Harness reports precision/recall for is_pun detection, and separately for pun_type classification restricted to true-positive pun rows
- [x] #3 Harness is runnable via a documented command in eval/README.md
- [x] #4 Undetermined predictions (is_pun: null, per docs/contracts.md) are counted and reported separately as coverage, never silently scored as non-puns
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. uv sync inference/ on task-2.3-live-eval (PR 85 branch), download WordNet (oewn:2025) and Wiktionary SQLite per docs/local-setup.md.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Addressed an adversarial code review before finalizing: extracted slice_report as a module-level _slice_report function for testability, fixed a misleading is_pun validation error message, and documented fixture_analyzer's words_involved as a contract-shape placeholder (not a real prediction). Expanded eval/tests/test_evaluate_dataset.py from 9 to 21 tests, adding coverage the review flagged as missing: HTTP failure modes for analyze_endpoint (HTTPError/URLError/TimeoutError/invalid JSON), fixture_analyzer contract correctness, empty food_baseline slice (zero-row division-by-zero safety), animal/food category inclusion, malformed CSV rows (missing required column, unparseable is_pun), and main()/parse_args CLI behavior (exit codes, --output writing). Re-verified the fixture-mode self-validation numbers are unchanged after the refactor (4,030/4,030 rows, 0 errors). uv run ruff check . passes with zero findings.

Addressed yaitorr's PR #23 code review: (1) validate_response() now also rejects is_pun=true responses with a missing/null pun_type (previously only checked the reverse direction), matching load_dataset()'s existing bidirectional enforcement and TASK-2.3's own description; added test_validate_response_rejects_pun_without_type as a regression test, reproducing the reviewer's exact repro case. (2) eval/reports/task-2.3-harness-validation.md and eval/README.md's repro commands switched from PowerShell-only (Push-Location/Pop-Location) to plain bash, matching docs/local-setup.md convention. (3) CI wiring gap was fixed directly on this branch by yaitorr (test-eval job added to .github/workflows/test.yml). (4) inference/main.py's AnalyzeResponse missing sense_source is a pre-existing inference/-side gap, not introduced by this PR; needs its own follow-up once a live run against TASK-16's classifier is attempted. 22/22 tests passing, ruff clean.

Open decisions for Eval (raised by the 2026-09-23 /analyze contract change, for Prateek): (1) compute is_pun precision/recall over determined rows only and report coverage separately, or count undetermined as a miss? (2) an HTTP/transport error from /analyze is a failed run, not an undetermined prediction; the harness calls /analyze directly, so it must not copy Backend's 'error becomes undetermined' mapping even though AC #1 follows TASK-9's client pattern. Note: the harness merged from main currently raises EvaluationError on is_pun: null (validate_response in eval/evaluate_dataset.py), so an undetermined /analyze result fails the run today; AC #4 needs that validation relaxed alongside the coverage reporting.

Open decisions resolved in PR #31 (2026-09-25, option C): (1) validate_response accepts the undetermined result (is_pun and confidence null together, with null pun_type/sense_source, words_involved [] and explanation ''), and each slice scores is_pun/pun_type over determined rows only, reports undetermined_rows and detection_coverage (determined / successful rows) beside them, and adds is_pun_end_to_end with undetermined scored as not-a-pun. (2) Transport errors stay request_errors; the old coverage field is renamed response_rate so it isn't confused with detection_coverage. Fixture run unchanged (4,030/4,030, 0 errors, F1 1.0, 0 undetermined). 28 tests, each new scoring/validation branch mutation-checked; ruff clean.

Live run against PR 85's classifier (branch task-2.3-live-eval, stacked on review/pun-detector@b5dd5f7): 4,030/4,030 rows, 0 errors, 0 undetermined. is_pun F1 0.934 (precision 0.900, recall 0.970), pun_type accuracy 0.741 (homographic F1 0.785, homophonic F1 0.709). Required downloading the detector's MiniLM encoder snapshot locally (inference/README.md's local setup step, not yet folded into docs/local-setup.md -- flagging as a docs-drift follow-up). Full numbers in eval/reports/task-2.3-harness-validation.md's new Live run section; raw JSON output gitignored (eval/*-results.json), regenerate via the documented command.

Code review (subagent) flagged two issues, both fixed: (1) baseline-slice naming mismatch between the fixture run's food-only 247-row slice and the live run's animal_food slice -- reworded for clarity. (2) AC #2's 'true-positive pun rows' wording didn't match the implementation, which scored pun_type over all gold is_pun:true rows. Fixed evaluate_dataset.py's _type_metrics to restrict pun_type scoring to detector true positives (gold AND predicted is_pun:true); added test_evaluate_excludes_detector_false_negatives_from_pun_type; updated eval/README.md's description to match. Re-ran the live eval after the fix: pun_type support drops from 2,878/354 (gold-positive) to 2,793/342 (detector-TP) rows; accuracy 0.764 all-categories / 0.751 animal_food (was 0.741/0.726 under the old gold-positive scoring -- is_pun metrics unchanged). 29/29 tests pass (unittest, matching CI's actual command, not pytest), ruff check and ruff format clean. DoD #3 (docs drift): the detector's encoder-download step lives in inference/README.md but is missing from docs/local-setup.md -- that gap belongs to PR #85 (TASK-16), not introduced by this task; checked per explicit instruction, not self-certified as resolved.

PR #89 review (yaitorr, CHANGES_REQUESTED): the live-run numbers scored the detector partly against its own training data (docs/experiments/pun-detector/prototype-1/splits.json: 2,820 train / 604 dev / 606 test rows). Added --ids/--ids-key to evaluate_dataset.py to filter to a named split; rewrote the report to show the unseen test split first (is_pun F1 0.898, pun_type accuracy 0.681) and all-rows second (F1 0.934, accuracy 0.764), with the gap explained and an animal_food small-sample (60 rows) caveat. Also added probabilities contract validation (shape/range/sum-to-1/confidence-consistency) to validate_response, since the review noted it wasn't checked despite the harness's own claim to validate the full contract shape.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Completed TASK-2.3's remaining AC #1: ran eval/evaluate_dataset.py against a live /analyze classifier (PR 85's detector, branch task-2.3-live-eval stacked on review/pun-detector@b5dd5f7) -- 4,030/4,030 rows, 0 errors, 0 undetermined. is_pun F1 0.934 (precision 0.900, recall 0.970); pun_type accuracy 0.764 all-categories / 0.751 animal_food, scored over detector true positives per AC #2. A code-review subagent caught a baseline-naming inconsistency and an AC #2 wording/implementation mismatch (pun_type was scored over all gold-positive rows, not true positives); both fixed in evaluate_dataset.py, eval/README.md, and the validation report, with a new regression test. Verified via uv run python -m unittest discover -s tests (29/29 pass), ruff check, ruff format --check. Full numbers in eval/reports/task-2.3-harness-validation.md's Live run section. Architectural review not needed (no change to contracts.md, topology, or isolation). Docs-drift: the detector's encoder-download step is documented in inference/README.md but missing from docs/local-setup.md -- that gap belongs to PR 85/TASK-16, not this task; flagged, not fixed here.
<!-- SECTION:FINAL_SUMMARY:END -->
