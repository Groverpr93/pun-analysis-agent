---
id: TASK-18
title: Extract dependency-parse local context for candidate words
status: Done
assignee: []
created_date: '2026-09-20 10:04'
updated_date: '2026-09-28 21:32'
labels:
  - wsd
milestone: m-6
dependencies:
  - TASK-1
references:
  - docs/design/sense-selection.md
project: inference
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Step 3 of docs/design/sense-selection.md's approach: parse the sentence and find the grammatical relation each candidate from TASK-1 sits in relative to its governing predicate (e.g. dough as obj of need), so later scoring can check whether a sense fits this specific slot rather than relying on bag-of-words proximity.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given a sentence and a candidate word, returns the candidate's grammatical relation and governing predicate
- [x] #2 Unit tests cover the dough/need(obj) example from docs/design/sense-selection.md
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Re-enable spaCy's parser in candidates.py's model loader (public get_model()). 2. Callers parse each sentence once and pass the same Doc to extract_candidates(doc) and local_contexts(doc, candidates), so candidate indexes always match the Doc. 3. context.py: LocalContext(relation, predicate) per candidate, resolving the real governing predicate: climb conj links to the list's first item; for pobj skip the preposition (relation prep_<prep>, predicate = the preposition's head); for nsubj of a verb with an acomp/attr child, use that complement as the predicate; ROOT has predicate None. 4. Tests: rule cases on hand-built Docs (explicit parse trees, independent of the statistical parser) plus real-sentence checks that the pinned en_core_web_sm produces the shapes the rules expect. 5. Code review pass.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: 9/9 inference tests pass (uv run pytest), ruff clean. Confirmed via direct spaCy parse printout: dough=dobj/need, batter=nsubj/be (copula "was" is the actual head, not "ready" -- design doc's prose was wrong here), Run=ROOT/None.

Code review (high) found 4 issues, all fixed: (1) local_context() re-parsed the sentence once per candidate -- rewritten as local_contexts(text, candidates) batch function, one parse per sentence regardless of candidate count; (2) reached into candidates._get_model() (a private symbol) -- renamed to public get_model(), now a documented shared accessor; (3) no validation that candidate.index matches the given text -- _token_for() now raises ValueError on a text/candidate mismatch, covered by a test; (4) stray untracked frontend/package-lock.json left over from an earlier PR-review session (repo is pnpm-only) -- deleted.

Also corrected docs/design/sense-selection.md's Step 3 example: it said dough is 'obj' of need and batter is 'nsubj' of 'was ready' -- actual spaCy output (en_core_web_sm, pinned <3.9.0) is 'dobj', and batter's head is the copula 'be', not 'ready'.

PR #36 review (Yai, 2026-09-26): (1) extract_candidates and local_contexts now both take the parsed Doc instead of text, so each sentence is parsed once and a text/candidate mismatch can't happen; _token_for, its ValueError check (which an out-of-range index bypassed with IndexError) and the mismatch and parse-count tests were removed. (2) The raw parse head often isn't a predicate (pobj gives the preposition, conj gives the sibling noun), and TASK-19's selectional-preference seeds are keyed by (predicate, relation), so the pair is cleaned up here: conj -> climb to the first conjunct (a loop, since spaCy chains lists), pobj -> relation prep_<prep> with the preposition's head as predicate (prep_ chosen over UD-style obl: to match spaCy's other labels), nsubj with an acomp/attr sibling -> that complement as predicate (be/look/seem accept any subject). This reverses the earlier note: batter is now nsubj/ready, matching the design doc's original target, which is restored in docs/design/sense-selection.md step 3 along with a description of the pair format. Verified each rule by removing it (and turning the conj loop into a single hop): at least one test fails every time.

PR #36 approval round (Yai, 2026-09-27): added a copula complement rule, the mirror of the subject rule: an acomp/attr complement reports the subject as its predicate ('was ready' -> acomp / batter), falling back to the verb when it has no nsubj child ('I used to be a banker' -> attr / be, since I is the subject of used). So for complements, predicate holds a noun and TASK-19 asks which sense fits the subject; documented in the local_contexts docstring and design doc step 3. Added the missing attr test ('was a lefty'), made the in-order test compare the full list, and noted in the design doc that prep_<prep> is our label, not spaCy's. Re-checked every rule by removing it (conj, single-hop conj, pobj, copula subject, attr, complement, ROOT): at least one test fails each time.

Merged in PR #36 as ffe2497 (2026-09-28) after two review rounds with Yai.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
inference/context.py: local_contexts(doc, candidates) returns each candidate's (relation, predicate), resolving the real governing predicate through conjunct lists, prepositions (prep_<prep>) and copula-like verbs: a subject takes the verb's acomp/attr complement as predicate, and the complement takes the subject (predicate is then a noun); ROOT has predicate None. extract_candidates now also takes the parsed Doc, so each sentence is parsed once. Verified with 15 rule cases on hand-built Docs (trees copied from en_core_web_sm) and 4 real-sentence checks against the pinned model; 41/41 inference tests pass, ruff check and ruff format clean; each rule confirmed covered by removing it. docs/design/sense-selection.md step 3 describes the pair format.
<!-- SECTION:FINAL_SUMMARY:END -->
