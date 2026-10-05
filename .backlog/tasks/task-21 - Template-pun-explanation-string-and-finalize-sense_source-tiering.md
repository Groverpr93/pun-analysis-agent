---
id: TASK-21
title: Template pun explanation string and finalize sense_source tiering
status: To Do
assignee:
  - '@Andi-Cast'
created_date: '2026-09-20 10:04'
updated_date: '2026-10-04 20:57'
labels:
  - wsd
milestone: m-6
dependencies:
  - TASK-19
references:
  - docs/design/sense-selection.md
  - docs/contracts.md
priority: high
project: inference
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Step 6 of docs/design/sense-selection.md's approach: once TASK-19 has produced a winning sense pair, template the /analyze explanation field per the design doc's pattern ("{word}" can mean {gloss_1} or {gloss_2}; the sentence supports both because {evidence}), and make sure sense_source reflects whichever tier actually won end-to-end. When no tier produces a confident pair, Inference doesn't template anything: per docs/contracts.md (2026-09-23 Tier 3 redesign) it returns sense_source "llm_fallback" with an empty explanation, and Backend's Gemini supplies the senses (TASK-20). Inference never calls an LLM itself.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given a winning sense pair, explanation is templated per docs/design/sense-selection.md's pattern
- [ ] #2 Unit tests cover the dough/money example end-to-end producing the exact explanation shape
- [ ] #3 sense_source (added to AnalyzeResponse by TASK-16) is wordnet/wiktionary for whichever tier produced the winning senses; when no tier produced a confident pair it stays llm_fallback with an empty explanation; null when sense selection didn't run (is_pun false or null)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
From TASK-17/19: a winning sense pair can mix a WordNet and a Wiktionary sense. Decide which `sense_source` `/analyze` reports for it (suggested: `"wiktionary"` if either sense came from Wiktionary, since WordNet alone couldn't produce that pair).

Decided in TASK-19: a mixed WordNet+Wiktionary winning pair reports "wiktionary"; PunSignal.sense_source already carries this, so TASK-21 passes it through to /analyze.

From TASK-19's architectural review (2026-09-28): (1) PunSignal.sense_source is set even when has_pun_tension() is false, but contracts.md only allows wordnet/wiktionary for a confident pair, so check has_pun_tension first; no signal, no tension, or an exception from default_embed must all become llm_fallback with an empty explanation. (2) Nothing yet decides which candidate's signal wins when several words in a sentence have one (e.g. smallest margin, or the pun detector's word). (3) scoring uses the placeholder MARGIN_THRESHOLD (0.1); see TASK-2.4.

From TASK-19's review (2026-09-29): the two-category seeds (need/want + dobj -> food or money) tie any word with a food and a money WordNet sense, whatever the rest of the sentence says: "I want more bread with my soup." scores margin 0. Sense selection only runs when the detector says is_pun: true, but in a real pun sentence a seeded bystander word could still beat the actual pun word. So when choosing which candidate wins, don't let "selectional_preference beats embedding_lesk" decide on its own. PunSignal.method (added in TASK-19) says which scorer produced the pair.

2026-10-03: PR #85 already templates an explanation in pun_detector/agent.py's select_senses ('"{word}" can mean {gloss} or {gloss}. {evidence} Their score difference is {margin}. This is a proposed interpretation...'), which differs from this task's pattern; TASK-58 moves that orchestration into sense selection first. From PR #85's architectural review: sense-selection.md asks Inference to log why it fell back (no confident pair vs an internal error), but agent.py only logs exceptions, so a no-pair result and every homophonic llm_fallback are silent.

2026-10-03 (TASK-58): sense selection's orchestration and its explanation template now live in inference/selection.py (select_senses / pun_readings), not pun_detector/agent.py. From TASK-58's code review: when the shared-word or gloss-similarity filter rejects a candidate's pair, the whole candidate is skipped instead of trying its next distinct sense, so a word with a valid third sense falls through to the next candidate or llm_fallback. These are really 'distinct sense' rules; folding them into scoring's pun_margin/_distinct would fix it, but changes behaviour, so it belongs here or with TASK-2.4.
<!-- SECTION:NOTES:END -->
