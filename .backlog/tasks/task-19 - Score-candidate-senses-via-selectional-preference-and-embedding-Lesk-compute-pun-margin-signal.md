---
id: TASK-19
title: >-
  Score candidate senses via selectional preference and embedding-Lesk; compute
  pun-margin signal
status: To Do
assignee: []
created_date: '2026-09-20 10:04'
updated_date: '2026-09-28 09:47'
labels:
  - wsd
milestone: m-6
dependencies:
  - TASK-17
  - TASK-18
references:
  - docs/design/sense-selection.md
  - docs/contracts.md
project: inference
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Steps 4-5 of docs/design/sense-selection.md's approach, plus Tier 1: score each TASK-17 sense against its TASK-18 predicate+relation slot using hand-seeded selectional-preference classes (hypernym-chain overlap), falling back to embedding-Lesk gloss/context scoring (sentence-transformers all-MiniLM-L6-v2) when there's no seed for that predicate. Take the margin between the top two senses -- only when they sit under different top-level hypernyms -- as the signal for whether sense selection has a pun pair to explain, replacing plain argmax WSD.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given a candidate's senses and its dependency-parse slot, returns a score per sense from the seeded selectional-preference classes with an embedding-Lesk fallback
- [ ] #2 Computes a margin between the top two senses only when they sit under different top-level hypernyms
- [ ] #3 sense_source is set to wordnet or wiktionary per docs/contracts.md, reflecting which tier produced the winning senses
- [ ] #4 Unit tests cover a confident-margin case (sense_source wordnet/wiktionary) and a low-margin case, which hands off with sense_source llm_fallback rather than setting is_pun false (detection alone owns is_pun)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
From TASK-14 (2026-09-28): the Inference Cloud Run service runs with Cloud Run's default 512 MiB memory (deploy-inference.yml sets no --memory) and the image is already ~219 MB compressed against Artifact Registry's 0.5 GB free tier (shared with Backend). A torch-based dependency (sentence-transformers) would likely exceed both: an out-of-memory instance crashes, and Backend then returns the undetermined result for every call. Check memory and image size when adding it, set --memory in deploy-inference.yml if needed, and fill in AGENTS.md's TBD memory budget.
<!-- SECTION:NOTES:END -->
