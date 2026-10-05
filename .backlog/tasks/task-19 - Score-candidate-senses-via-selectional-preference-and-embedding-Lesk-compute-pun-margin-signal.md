---
id: TASK-19
title: >-
  Score candidate senses via selectional preference and embedding-Lesk; compute
  pun-margin signal
status: Done
assignee:
  - '@Andi-Cast'
created_date: '2026-09-20 10:04'
updated_date: '2026-10-04 20:57'
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
Steps 4-5 of docs/design/sense-selection.md's approach, plus Tier 1: score each TASK-17 sense against its TASK-18 predicate+relation slot using hand-seeded selectional-preference classes (hypernym-chain overlap), falling back to embedding-Lesk gloss/context scoring (all-MiniLM-L6-v2 through fastembed's ONNX runtime, not sentence-transformers, to avoid torch) when there's no seed for that predicate. Take the margin between the top sense and the best-scoring sense in a different category as the signal for whether sense selection has a pun pair to explain, replacing plain argmax WSD.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given a candidate's senses and its dependency-parse slot, returns a score per sense from the seeded selectional-preference classes with an embedding-Lesk fallback
- [x] #2 Computes a margin between the top sense and the best-scoring sense in a different category, where "different" means a different WordNet lexfile when both senses have one, and otherwise (Wiktionary senses, or adjectives' shared `adj.all`) a gloss-embedding distance above a threshold
- [x] #3 sense_source is set to wordnet or wiktionary per docs/contracts.md, reflecting which tier produced the winning senses
- [x] #4 Unit tests cover a pun case (two distinct senses with a small margin, sense_source wordnet/wiktionary) and a non-pun case (a large margin, or no distinct pair), which TASK-21 turns into llm_fallback rather than setting is_pun false (detection alone owns is_pun)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. inference/scoring.py: seed table SELECTIONAL_PREFERENCES keyed by TASK-18's (predicate, relation) pairs, with classes checked against real OEWN chains. 2. score_senses: ONE method per candidate: binary selectional preference when the slot has seeds, every sense is from WordNet, and at least one sense matches; otherwise embedding-Lesk (cosine of sentence vs gloss, one batched embed call; embed injected so tests use fakes). 3. pun_margin: stable sort, top vs the first later sense in a different category (lexfile, or gloss cosine < 0.5 for Wiktionary senses and adj.all), margin = score difference, sense_source wiktionary if either sense is from Wiktionary. 4. has_pun_tension: margin <= MARGIN_THRESHOLD (placeholder for TASK-2.4). 5. default_embed: fastembed all-MiniLM-L6-v2, lazy with a double-checked lock; model baked into the Docker image and loaded offline. 6. Tests with hand-built senses and fake 2-D vectors; code + architectural review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
From TASK-14 (2026-09-28): the Inference Cloud Run service runs with Cloud Run's default 512 MiB memory (deploy-inference.yml sets no --memory) and the image is already ~219 MB compressed against Artifact Registry's 0.5 GB free tier (shared with Backend). A torch-based dependency (sentence-transformers) would likely exceed both: an out-of-memory instance crashes, and Backend then returns the undetermined result for every call. Check memory and image size when adding it, set --memory in deploy-inference.yml if needed, and fill in AGENTS.md's TBD memory budget.

Implemented inference/scoring.py (2026-09-28): score_senses uses ONE method per candidate: binary selectional preference when the (predicate, relation) slot has seeds and at least one sense's hypernym chain contains a seed class, otherwise embedding-Lesk (cosine of sentence vs gloss via fastembed all-MiniLM-L6-v2; embed is injected so tests use hand-picked vectors). pun_margin compares the top sense with the best-scoring sense in a different category (lexfile, or gloss cosine < 0.5 when a lexfile is missing or adj.all); ties keep WordNet order. sense_source is "wiktionary" if either sense of the winning pair came from Wiktionary (a mixed pair couldn't come from WordNet alone), else "wordnet"; TASK-21 passes it through. Seeds (18 slots) were checked against real OEWN 2025 chains: bread reaches "solid food", never "food", and cash reaches "medium of exchange", never "money", so the seed classes cover both. Keys follow TASK-18's final pairs (prep_<prep>; complements have a noun predicate). Real-model check: 'The baker needed more dough.' -> margin 0.00, pun; 'She rolled the dough flat.' -> Lesk 0.47 vs 0.04, not a pun; 'He hid the money in the dough.' -> seeds 1.0 vs 0.0, not a pun. 50/50 inference tests pass; every rule checked by removing it (including the <= threshold boundary).

Deploy check (2026-09-28, architectural + code review): the embedding model is baked into the image at build time (Dockerfile build stage downloads it to /fastembed_cache; runtime sets HF_HUB_OFFLINE=1; the build-time check calls default_embed), so a cold start never downloads it. Verified with docker build and the full pipeline in a container with --network none. Measured in the Linux container: peak RSS 186 MB (spaCy + WordNet + Wiktionary), 318 MB with the model loaded, 352 MB after scoring every candidate of 3 sentences with 40-60-sense verbs, vs Cloud Run's 512 MiB default; main.py doesn't import scoring yet, so production memory is unchanged until TASK-21. Compressed image grows from ~207 MB to ~333 MB (+126 MB): flagged for TASK-40 (Artifact Registry was 393 of 500 MB on 2026-09-28).

Review round (2026-09-28): code review and AGENTS.md architectural review done; all 9 findings addressed: model baked into the image and loaded offline (HF_HUB_OFFLINE=1, build-time embed check); memory/image measured and flagged on TASK-40; ('deposit', 'prep_in') seed no longer includes 'container' (it tied the piggy-bank sense with the financial one: a fake pun); selectional preference skipped when any sense is from Wiktionary (no hypernym chain, so seeds can't judge it); adj.all test added; design doc/local-setup/README updated for fastembed; AC #4 reworded to match the design doc; TASK-21/TASK-2.4/TASK-32 notes added. Every rule verified by removing it (each fails at least one test).

Review round 2 (Yai, 2026-09-29): ScoredSense now records the method that scored it ("selectional_preference" or "embedding_lesk"), exposed as PunSignal.method, so TASK-2.4 can calibrate on Lesk signals alone (selectional-preference margins are always 0 or 1) and TASK-21 can tell "fits the slot" from a cosine. _cosine uses numpy (now a direct dependency; same locked version). local-setup.md has an explicit one-time model download step. Two known limitations went to sense-selection.md's Open questions: Lesk margins shrink as a word gains senses (window 0.043, book 0.083 at the 0.1 placeholder; numbers on TASK-2.4), and binary seeds tie any food/money word after need/want ("I want more bread with my soup." margin 0), so they confirm a detector false positive instead of catching it (seeded-bystander risk noted on TASK-21). Artifact Registry: Yai OK'd merging over the free tier on promo credits; cleanup stays with TASK-40. Merged in #76 as cffd528.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added inference/scoring.py: score_senses scores a candidate's senses against its TASK-18 slot with binary selectional preference (18 seeded slots, classes checked against OEWN) or, when there's no usable seed or any sense is from Wiktionary, embedding-Lesk via fastembed's all-MiniLM-L6-v2, and tags each score with the method used; pun_margin compares the top sense with the best sense of a different category (lexfile, or gloss distance for Wiktionary/adj.all senses) and reports sense_source (wiktionary if either sense is) and method; has_pun_tension applies the placeholder MARGIN_THRESHOLD, which only affects Lesk margins. The model is baked into the Docker image and loaded offline. Verified: 53/53 inference tests pass (12 scoring tests on hand-built senses and fake vectors, each rule confirmed covered by removing it), ruff clean, docker build with in-image checks, the full pipeline run offline in the container, and real-model runs ('The baker needed more dough.' -> margin 0.00, pun; 'She rolled the dough flat.' -> 0.43, not a pun). Peak memory 352 MB; compressed image +126 MB (TASK-40). Known limitations are in sense-selection.md's Open questions. Merged in #76 as cffd528.
<!-- SECTION:FINAL_SUMMARY:END -->
