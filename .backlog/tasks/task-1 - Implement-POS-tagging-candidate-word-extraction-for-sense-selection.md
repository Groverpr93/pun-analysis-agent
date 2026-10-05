---
id: TASK-1
title: Implement POS-tagging candidate-word extraction for sense selection
status: Done
assignee:
  - '@Andi-Cast'
created_date: '2026-09-16 19:45'
updated_date: '2026-10-04 20:57'
due_date: '2026-09-21'
labels:
  - wsd
milestone: m-6
dependencies: []
references:
  - docs/milestones/milestone-3.md
  - docs/design/sense-selection.md
project: inference
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
First step of the sense-selection pipeline (docs/milestones/milestone-3.md): tag input text and keep only open-class tokens (NOUN, VERB, ADJ) as pun-word candidates.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given a sentence, returns candidate tokens filtered to NOUN/VERB/ADJ
- [x] #2 Closed-class function words are excluded
- [x] #3 Unit tests cover at least one homographic example (e.g. the dough/money case in docs/design/sense-selection.md)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add spacy + en_core_web_sm as pinned deps (done). 2. Add inference/candidates.py: CandidateWord dataclass (text, lemma, pos, index) + extract_candidates(text) -> list[CandidateWord], lazy-loaded spaCy model via lru_cache per AGENTS.md perf guidance. 3. Filter to POS in {NOUN, VERB, ADJ}. 4. Add inference/tests/test_candidates.py covering: a sentence with 2+ candidates incl. the dough/money homographic example from docs/design/sense-selection.md, and a sentence confirming closed-class words (DET/PUNCT/ADP) are excluded. 5. Run ruff + pytest, verify ACs, then finalize.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented inference/candidates.py: CandidateWord dataclass + extract_candidates(), spaCy en_core_web_sm loaded lazily via lru_cache with ner disabled (perf review finding). Code review (medium) flagged NER cold-start cost and a test-coverage gap (ADP/PRON not exercised) -- both fixed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added inference/candidates.py (extract_candidates) filtering spaCy POS tags to NOUN/VERB/ADJ, with inference/tests/test_candidates.py covering the dough/money homographic example (AC1, AC3) and DET/ADP/PRON/PUNCT exclusion (AC2). Verified: uv run pytest (3 passed), uv run ruff check (clean), code-review skill run and both findings fixed.
<!-- SECTION:FINAL_SUMMARY:END -->
