---
id: TASK-2.2
title: Curate and verify food/animal-food baseline subset against original scope
status: Done
assignee:
  - '@lecastro-tech'
created_date: '2026-09-20 10:05'
updated_date: '2026-10-04 20:57'
labels:
  - dataset
milestone: m-6
dependencies: []
references:
  - 'https://github.com/team-play/pun-analysis-agent/pull/15'
parent_task_id: TASK-2
project: eval
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-2 originally framed animal puns as a stretch goal pending data; that is no longer the case. Livia and Prateek decided the baseline covers food and animal from the beginning. SemEval's own category column has food, animal and animal/food rows well past the original >=30-pair bar (218 food, 234 animal, 29 animal/food), and PR #8/TASK-2.5 adds a further aggregated food+animal set (deferred, see TASK-2.6).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Food and animal-food rows in the eval dataset are counted and checked against the >=30-pair minimum from TASK-2's original scope
- [x] #2 A decision is recorded on whether the food/animal-food subset or the full corpus is used for TASK-16's baseline classifier
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Counted eval/datasets/semeval2017_task7_puns.csv by category: food = 218 rows (175 is_pun=True, 43 False); animal = 234 rows (160 True, 74 False); animal/food = 29 rows (19 True, 10 False); combined food+animal baseline = 481 rows, both classes present in each category. This clears TASK-2's original >=30-pair minimum by a wide margin (AC1). AC2 decision (Livia and Prateek, 2026-09-25): the baseline is food and animal from the beginning, and TASK-16's classifier uses this subset (categories food, animal, animal/food) rather than the full corpus. Note: the eval harness's food_baseline slice (TASK-2.3, evaluate_dataset.py) currently covers only food and animal/food (247 rows), so it does not yet report this combined subset; it also reports all_categories. Not to be confused with TASK-2.6, which is about PR #8's separate dataset (deferred); SemEval was assessed as fine for classification.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Counted the SemEval food, animal and animal/food rows (481 in total, past the >=30-pair bar) and recorded the decision that the baseline covers food and animal from the beginning, with TASK-16's classifier using this subset rather than the full corpus. The harness's food_baseline slice does not yet include the animal category.
<!-- SECTION:FINAL_SUMMARY:END -->
