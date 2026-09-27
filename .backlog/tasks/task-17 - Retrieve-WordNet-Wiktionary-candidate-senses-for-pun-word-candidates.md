---
id: TASK-17
title: Retrieve WordNet/Wiktionary candidate senses for pun-word candidates
status: In Progress
assignee:
  - Andi J. Castillo-Mauricio
created_date: '2026-09-20 10:04'
updated_date: '2026-09-26 12:00'
labels:
  - wsd
milestone: m-6
dependencies:
  - TASK-1
references:
  - docs/design/sense-selection.md
project: inference
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Step 2 of docs/design/sense-selection.md's approach: for each POS-tagged candidate from TASK-1, pull WordNet synsets, glosses, and hypernym chains (Tier 0, Open English WordNet). When a candidate lemma has 0-1 senses, expand the inventory with Wiktionary definitions (Tier 2, kaikki.org dumps) before scoring gives up on it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given a candidate word and POS tag, returns its WordNet synsets with glosses and hypernym chains
- [x] #2 When WordNet returns 0-1 senses for a candidate, Wiktionary definitions are pulled as a fallback sense inventory
- [x] #3 Unit tests cover a candidate with 2+ WordNet senses and one with a coverage gap requiring the Wiktionary fallback
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add `wn` (Open English WordNet, `oewn:2025`) as a runtime dep; download `oewn:2025` in the Docker build and the CI `test-python` job, documented in docs/local-setup.md. 2. Add inference/senses.py: `Sense` dataclass (gloss, hypernyms, lexfile, source); `get_wordnet_senses()` (Tier 0: synsets for the candidate's lemma across its POS tags, with glosses and hypernym chains), lazily loaded behind a lock. 3. Add inference/scripts/build_wiktionary_db.py, which prunes kaikki.org's English dump into a small SQLite file published as a GitHub Release and downloaded by the Dockerfile. 4. `get_wiktionary_senses()` (Tier 2 fallback, reads that file) and `get_candidate_senses()`, which falls back to Wiktionary when WordNet returns fewer than 2 senses. 5. Add inference/tests/test_senses.py covering multi-sense retrieval, the fallback path and its boundary, the build script's filters, and a missing data file. 6. Run ruff + pytest, verify ACs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Tier 2 reads kaikki.org's pre-parsed Wiktionary dump, as the design doc specifies. The English dump is 3.3 GB; scripts/build_wiktionary_db.py streams it and keeps single-word English noun/verb/adj entries with one gloss per sense, dropping form-of/alt-of senses ("plural of dough", "Alternative form of bun"), which carry no meaning of their own and are 43% of glosses. The result is a ~66 MB SQLite file (`senses(word, pos, gloss)`, indexed on `(word, pos)`), published as a `wiktionary-data-*` GitHub Release and downloaded in the Dockerfile, so `/analyze` makes no request-time network calls, and CI never downloads the Wiktionary file (tests build a small fixture DB). It is opened lazily and read-only, so memory stays near zero, and a missing or unreadable file degrades to no extra senses with a logged warning (never a 500, and not mistaken for a coverage gap). Tests build a small fixture DB with the real `build_db`. Wiktionary data is CC BY-SA 4.0; attribution is in inference/README.md and the Release notes. The design doc's open question on dump size is resolved with these numbers.

Review fixes (code-review skill passes, PR #25, and the AGENTS.md code and architectural reviews): WordNet loaded behind a double-checked lock, with `wn.config.allow_multithreading` set (and `check_same_thread=False` for the Wiktionary connection) so both work on FastAPI threadpool workers; both connections are shared, so lookups also hold their lock (concurrent queries on one sqlite3 connection raised InterfaceError and returned wrong senses under a stress test); the read-only Wiktionary URI is built with `Path.as_uri()` so paths containing `#` or `%` work; the Dockerfile pins the Release asset's SHA-256; hypernym walk capped at 50; Wiktionary queried by lemma, not surface text; `hypernyms` is a tuple so `Sense` is hashable; `lexfile` added for TASK-19 (None means "category unknown"); Dockerfile uses `uv run --no-dev` so dev deps stay out of the image.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added inference/senses.py: `get_candidate_senses()` returns WordNet senses (gloss, hypernym chain, lexfile) and falls back to Wiktionary definitions from a pruned kaikki.org SQLite file when WordNet has 0-1 senses (AC1, AC2). Added inference/scripts/build_wiktionary_db.py to build that file. inference/tests/test_senses.py covers "dough" (2+ senses, no fallback), "rizz" (coverage gap), "pun" (exactly 1 sense, merged with Wiktionary), NOUN/VERB/both ADJ tags, lemma-based lookup, cross-thread and concurrent use of both WordNet and Wiktionary, hashability, paths with URI special characters, the build script's language/POS/multi-word/form-of filters, and a missing data file (AC3). Verified: uv run pytest (21 passed), uv run ruff check (clean), a local `docker build` with lookups run inside the container, and the setup step in docs/local-setup.md run as written. Architectural review follow-ups: image-size note added to TASK-14; the "different senses" rule for Wiktionary senses belongs to TASK-19.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->
