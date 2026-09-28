---
id: TASK-20
title: >-
  Backend: Gemini supplies the senses when /analyze returns llm_fallback (Tier
  3)
status: To Do
assignee: []
created_date: '2026-09-20 10:04'
updated_date: '2026-09-28 11:17'
labels:
  - wsd
milestone: m-6
dependencies:
  - TASK-9
  - TASK-12
references:
  - docs/design/sense-selection.md
  - docs/contracts.md
project: backend
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tier 3 of docs/design/sense-selection.md's sense-selection chain, redesigned 2026-09-23: Inference never calls Gemini. When Tiers 0-2 can't find a confident sense pair, Inference returns is_pun: true with sense_source: "llm_fallback" (empty explanation, suspected word(s) in words_involved), and Backend's Gemini, which receives that unchanged as the analyze_pun tool output, supplies two plausible senses and the explanation itself. The same instruction covers docs/contracts.md's undetermined result (is_pun: null: Inference couldn't judge the text, or Backend couldn't reach it), where Gemini decides whether the text is a pun at all. Detection alone decides is_pun, so detector false positives land here too.

Why: keeping every Gemini call in Backend means one service owns the Gemini key and its free-tier quota (TASK-13 gives Backend's Cloud Run service its own key, in a project without billing), and Inference stays a pure NLP service with no LLM dependency, no key of its own and nothing extra to mock. The original version of this task had Inference prompt Gemini 'via Genkit, already in the stack', but Genkit only exists in Backend (TypeScript); inference/ has no Genkit or Gemini dependency.

Split with TASK-12, which owns the system instruction's structure and scope/redirect rules (TASK-31.1 owns the persona), including consulting Inference through analyze_pun for each new phrase (by instruction, not a forced toolChoice). This task owns the llm_fallback part of that instruction and its behavior. Stays in m-6 because it is still Tier 3 of the sense-selection design, just executed by Backend's Gemini. docs/contracts.md and docs/design/sense-selection.md were updated to this design when the task was rewritten.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 inference/ gains no LLM dependency: no Gemini or Genkit package and no Gemini key
- [ ] #2 When the analyze_pun tool result has sense_source "llm_fallback", Gemini's reply explains the pun using two plausible senses of the suspected word that it supplies itself, presented as a lower-confidence reading, or says the text likely isn't a pun (detector false positives land here too)
- [ ] #3 The fallback adds no model or Inference calls beyond Genkit's standard tool loop: in tests, the mock model sees exactly two requests for a tool-using turn
- [ ] #4 For the undetermined result (is_pun: null), Gemini judges the text itself, pun or not, without implying Inference backed its answer
- [ ] #5 A Backend test using Genkit's test double asserts that, for both an llm_fallback and an undetermined (is_pun: null) tool result, the model request carries the matching guidance and the tool output unchanged; real replies are spot-checked against live Gemini and recorded in the task notes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
From TASK-12's review: the undetermined-result guidance ("If is_pun is null, the classifier couldn't judge the text: decide yourself.") currently lives in analyze_pun's tool description (backend/src/tools/analyze-pun.ts), not in backend/src/flows/system-instruction.ts. When adding the llm_fallback/undetermined paragraph to the system instruction, move or merge that sentence so the guidance lives in one place.
<!-- SECTION:NOTES:END -->
