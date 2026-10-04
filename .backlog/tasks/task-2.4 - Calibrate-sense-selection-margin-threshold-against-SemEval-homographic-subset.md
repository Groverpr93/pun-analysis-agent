---
id: TASK-2.4
title: Calibrate sense-selection margin threshold against SemEval homographic subset
status: Done
assignee:
  - '@lecastro-tech'
created_date: '2026-09-20 10:05'
updated_date: '2026-10-04 20:45'
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
- [x] #1 Margin threshold is calibrated against the homographic/is_pun:true subset of the eval dataset
- [x] #2 The chosen threshold and calibration methodology are recorded in docs/design/sense-selection.md's open questions section
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Aggregate both classes per sentence and report eligible/total coverage. 2. Select the flat threshold on dev under a provisional 30 percent conditional sentence FP cap; report test at the selected value. 3. Add behavioral tests, remove the pinned-value test, and update methodology plus seven review reports. 4. Verify inference/eval checks and independent review. 5. Publish the user-approved revision on PR #89; reviewer approval remains pending.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
From TASK-19 (2026-09-28): two placeholders in inference/scoring.py need calibrating, MARGIN_THRESHOLD (0.1) and GLOSS_DISTINCT_THRESHOLD (0.5, used when lexfiles can't separate senses: Wiktionary senses and adj.all adjectives). With 0.1, polysemous verbs scored by Lesk showed margins of 0.02-0.08 in the code review's samples (need, use, lose, die, go, stand), so they'd all read as puns; the threshold likely needs to be much lower or margin-relative. /analyze doesn't expose the margin, and inference/ and eval/ are separate uv projects, so calibration needs a way to get margins out (e.g. a script in inference/ that runs the SemEval subset, or a debug field).

From TASK-19's review (Yai, 2026-09-29): Lesk margins shrink as a word gains senses. Sentence-vs-gloss cosines bunch in a narrow band, and the runner-up is the best of every other-category sense. Real model, no seeded slot, ordinary non-pun sentences: window ("She opened the window to let in air.") 8 senses, margin 0.043; book ("He read the book on the train.") 10, 0.083; bank ("We had a picnic on the river bank.") 10, 0.041; tire ("Long meetings tire me out.") 4, 0.046. All four read as puns at 0.1. table/chair/interest (6/5/7 senses) 0.18/0.25/0.36 and dough ("She rolled the dough flat.", 2 senses) 0.43 did not. TASK-21 planning saw the same: "She rolled the dough flat." gave rolled 0.014 and flat 0.023. Calibration should check whether the margin needs to account for the number of senses. MARGIN_THRESHOLD only affects embedding-Lesk: selectional-preference scores are 0 or 1, so their margins are too. Calibrate on signals with PunSignal.method == "embedding_lesk".

Built inference/scripts/calibrate_margin.py: runs the full eval dataset through candidates->context->senses->scoring, collecting embedding_lesk-only margins. Negative set (3,752 candidate-level observations on is_pun:false rows) and positive set (1,602/1,607 homographic is_pun:true sentences, min margin per sentence). Sense-count normalization (margin*sense_count) tested via Pearson correlation (-0.228 negative, -0.080 positive -- too weak to be the dominant driver) and a normalized threshold sweep (worse fp_rate at matched recall than flat); rejected in favor of a flat threshold. User chose 0.03 (71.4% recall / 25.8% fp_rate) over the alternatives (0.02: 56.2%/18.2%; 0.05: 85.3%/38.9%) given Tier 3's llm_fallback is a graceful degradation, not an error -- a miss is cheaper than a confident misattribution. Code review (subagent) caught two issues, both fixed: (1) scoring.py had a leftover pre-calibration header comment implying GLOSS_DISTINCT_THRESHOLD was also calibrated (it wasn't, left at 0.5, explicitly marked 'Not yet calibrated'). (2) recall figures didn't disclose that 5/1,607 homographic rows had no eligible embedding-Lesk candidate and were excluded from the denominator -- added the coverage figure and the ~71.2% adjusted recall if counted as misses, to both scoring.py's comment and sense-selection.md. Added test_margin_threshold_is_the_task_2_4_calibrated_value as a regression guard. 54/54 inference tests pass, ruff check and ruff format clean.

PR #89 review (yaitorr, CHANGES_REQUESTED): threshold was tuned and reported on the same rows (optimistic). Restructured calibrate_margin.py to tune on the detector's dev split (604 rows) only and report on its held-out test split (606 rows), skipping train entirely. 0.05 held up: dev 81.4% recall/40.2% fp (vs 0.03's 65.0%/27.9%), test 78.2% recall/37.6% fp -- close to dev with no overfitting gap. Also reverted accidental TASK-16 contamination in docs/design/sense-selection.md (a fictitious CMUdict/phonetic-detection feature) that leaked in from an earlier stash-based restore this session, and removed a stale .gitignore entry (inference/pun_detector/.resources/) that TASK-55 had already removed on main.

2026-10-04 latest PR #89 review revision supersedes earlier calibration numbers and generalization claims. Both classes now use sentence-minimum embedding-Lesk margins with eligible/total coverage; dev 167/173 negative and 237/241 positive, test 170/173 and 239/241. Before recomputing corrected dev rates, set provisional flat-grid highest-recall rule with <=30% conditional sentence FP cap and smaller-threshold tie break. Original grid infeasible, extended downward on dev without changing cap; chose 0.01. Dev FP/recall 36/167 and65/237, test47/170 and78/239; all-sentence denominators also reported. Normalization .1 gives dev .293FP/.397recall and merits investigation rather than blanket rejection. Ranking omitted and selectional readings excluded; these are reading availability metrics, not end-to-end or word accuracy. Earlier full-data/test exposure disclosed. Pinned-value test removed; eight behavioral calibration tests added. Inference101/Eval38 tests and Ruff lint/format pass; independent review findings on cap chronology and LF fixed. Seven detailed reports with one-paragraph replies: eval/reports/pr-89-review/README.md. Leave task In Progress and all changes uncommitted pending user review.

2026-10-04: User approved publishing the latest revision. Rechecked current files: 101 inference and 38 eval tests pass; both packages pass Ruff lint/format. Acceptance criteria verified by the completed dev/test calibration and documented counts. Independent review findings addressed. Review reports now record publication approval. No contract, service topology, isolation guarantee, dependency or deploy target changes; architecture review not applicable. README/project-spec/local-setup/AGENTS conventions remain aligned: calibration invocation unchanged. Earlier notes about awaiting user approval are historical and superseded by this authorization.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
User-approved PR #89 review revision: both calibration classes use sentence minima and expose eligible/total coverage. Dev-only selection under a provisional 30 percent conditional sentence FP cap picks MARGIN_THRESHOLD=0.01; dev conditional recall/FP 27.4%/21.6%, test 32.6%/27.6%. Limitations include Lesk-only readings, no pun-word accuracy, omitted ranking, prior test exposure and non-optimal policy cap. Eight behavioral calibration tests replace the pinned-value guard. Seven per-comment reports/replies in eval/reports/pr-89-review/. Verified 101 inference tests, 38 eval tests, Ruff lint/format and independent code review. Ready for publication; PR reviewer approval remains pending.
<!-- SECTION:FINAL_SUMMARY:END -->
