---
id: TASK-58
title: 'Inference: move select_senses into sense selection and document its filters'
status: Done
assignee:
  - '@yaitorr'
created_date: '2026-10-03 21:30'
updated_date: '2026-10-04 20:57'
labels:
  - wsd
milestone: m-6
dependencies: []
references:
  - inference/pun_detector/agent.py
  - docs/design/sense-selection.md
  - inference/scoring.py
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR #85 wired sense selection's steps (candidates, context, senses, scoring) together for the first time, but did it inside the detector package: pun_detector/agent.py's select_senses imports internals of all four modules, including GLOSS_DISTINCT_THRESHOLD, and is now the only code that runs the Tier 0-2 pipeline in production. It also applies filters that docs/design/sense-selection.md doesn't describe: it rejects a pair whose runner-up score is <= 0, a pair whose two WordNet senses share an alternative lemma (shares_alternative_lemma), and any pair whose glosses are too similar (GLOSS_DISTINCT_THRESHOLD, applied to every pair, not only when lexfiles can't tell); and it tries candidates in the detector's ranking and returns the first that passes. Consequences found in PR #85's architectural review (2026-10-03, recorded on TASK-16): whoever works on sense selection or TASK-21 won't find the orchestrator where the design says it is, a change to scoring.py can break the detector package, and calibration that rebuilds the pipeline from the parts (PR #89's inference/scripts/calibrate_margin.py measures pun_margin alone) measures something production doesn't run, so a calibrated MARGIN_THRESHOLD can't be trusted until it goes through the same function. TASK-21 owns the explanation template and final tiering; this task is only about where the orchestration lives and what the design doc says it does.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The Tier 0-2 orchestration (today select_senses and shares_alternative_lemma in pun_detector/agent.py) lives in a top-level sense-selection module, and pun_detector imports only its public function, no other sense-selection internals
- [x] #2 docs/design/sense-selection.md describes every filter that function applies and how it chooses among candidates, or the code drops a filter the team decides against
- [x] #3 Calibration and evaluation code can call that same function on a sentence and get the pair (or no pair) production would, so a threshold is measured on what production runs
- [x] #4 Each filter has a unit test that fails when the filter is removed, and tests/test_pun_analysis.py passes unchanged
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Decided with Yai 2026-10-03. Pure move: no filter or explanation change; TASK-2.4 and TASK-21 own those.

1. senses.py: add a public alternative_lemmas(candidate, sense) that resolves a WordNet Sense to its unique synset (gloss + lexfile match, as agent.py does today) under senses.py's WordNet lock, and returns its other lemmas, or None when it can't resolve one.
2. New inference/selection.py: PunReading(candidate, signal); pun_readings(doc, embed, *, preferred=(), threshold=MARGIN_THRESHOLD) yields, in preferred order (token indexes, then the rest by position), each candidate whose sense pair has margin <= threshold, a positive runner-up score, no shared alternative lemma and distinct glosses; select_senses(doc, embed, *, preferred=()) formats the first reading as words_involved / explanation / sense_source, or returns None. The caller passes a parsed Doc, so production keeps one spaCy pipeline.
3. pun_detector/agent.py: drop select_senses and shares_alternative_lemma; PunAnalysis parses with the detector's pipeline and calls selection.select_senses with the detector's ranking as token indexes. tests/test_pun_analysis.py passes unchanged.
4. Tests: one per filter in tests/test_selection.py (fails when the filter is removed), plus ordering and the threshold parameter; alternative_lemmas against WordNet.
5. Prove no behaviour change: run old and new code over a sample of test-split sentences and compare words_involved, explanation and sense_source.
6. docs/design/sense-selection.md: describe selection.py, the filters and the candidate order. Correct TASK-51's note (production loads one spaCy pipeline; only features.py's comment is wrong).
7. Code review and architectural review subagents per AGENTS.md.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented 2026-10-03. inference/selection.py: pun_readings(doc, embed, *, preferred, threshold) yields PunReading(candidate, context, signal); select_senses() returns a SenseSelection TypedDict or None. pun_detector/agent.py keeps only select_with_detector, which passes the detector's parse, embed function and ranking (as token indexes) to select_senses, so PunAnalysis's selector seam is unchanged. senses.alternative_lemmas does the shared-word lookup under senses.py's WordNet lock; scoring gained gloss_similarity (also used by _distinct) and has_pun_tension takes a threshold, so pun tension has one definition. selection.py keeps its own MAX_CANDIDATES (32) but always keeps preferred candidates, so a change to the detector's cap can't drop a ranked word. The Dockerfile's build-time check now also asserts the baker sentence comes back wordnet / ['dough'], so broken selection fails the build instead of silently becoming llm_fallback.

Verified: every response field identical before and after on all 606 test-split sentences (243 wordnet, 11 wiktionary, 19 homographic llm_fallback among them), re-run after the review fixes; 93 inference tests pass, ruff clean. Each filter, the ordering, the cap, the threshold parameter, the adapter and alternative_lemmas' rules were broken on purpose (20 changes): every one fails at least one test.

Reviews (AGENTS.md): code review and architectural review subagents. Fixed: untested adapter; filter boundaries (runner-up exactly 0, margin exactly at the threshold); duplicated pun-tension rule; MAX_CANDIDATES coupling; dict return type; untested surface-form removal; the design doc overclaiming that calibration already calls pun_readings (it can, given the detector's ranking; Eval measures through /analyze); weak Docker smoke check. Documented, not changed: running pun_readings on threads alongside a loaded PunDetector isn't safe (two WordNet objects share wn's connection under different locks; production runs selection inside PunAnalysis's lock). Left as is, since this task is a pure move: repeated embedding (note on TASK-51), a vetoed pair dropping the whole candidate (note on TASK-21), two WordNet lookups per surviving candidate instead of one (606 sentences took 20 s before, 21 s after). The architectural review measured scoring.default_embed against the detector's onnx_embed: cosines differ by at most 2.5e-9, so calibration can use either; only the order (preferred) matters.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved sense selection's Tier 0-2 orchestration out of pun_detector/agent.py into a top-level inference/selection.py (#93, a9e2928). pun_readings(doc, embed, *, preferred, threshold) yields each candidate that passes every filter, in the detector's order; select_senses() formats the first one, or returns None. pun_detector imports only select_senses. senses.alternative_lemmas and scoring.gloss_similarity replace the private helpers agent.py reached into, and has_pun_tension takes a threshold so calibration can sweep it on the same code production runs. docs/design/sense-selection.md now documents every filter and the candidate order. It was a pure move: every /analyze field was identical before and after on all 606 test-split sentences. Each of 20 deliberate breakages (filters, ordering, cap, threshold, adapter) fails a test. Re-verified on main after merge: 93 inference tests pass, ruff check and format clean. Follow-ups noted on TASK-21 (a vetoed pair drops the whole candidate) and TASK-51 (repeated embedding).
<!-- SECTION:FINAL_SUMMARY:END -->
