---
id: TASK-31.1
title: 'Backend: give Gemini the Otto the otter persona'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-27 15:02'
updated_date: '2026-09-28 14:12'
labels: []
milestone: m-5
dependencies:
  - TASK-12
references:
  - backend/src/flows/chat.ts
  - docs/project-spec.md
  - backend/src/flows/system-instruction.ts
parent_task_id: TASK-31
type: feature
project: backend
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-12 limits Gemini to pun analysis, but nothing defines who is talking, so replies come in a neutral voice that clashes with the otter branding (TASK-22). This task gives the system instruction a character: Otto, a friendly, playful otter. Ownership inside the shared system instruction: TASK-12 owns the scope/redirect rules and the analyze_pun consultation rule, TASK-20 owns the llm_fallback paragraph, and this task owns character and voice. The persona applies to the whole conversation. There is deliberately no model-generated opening greeting, since the static frontend welcome costs no Gemini call (AGENTS.md Performance). Depends on TASK-12 because that task establishes the system instruction this one extends.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The system instruction presents the assistant as Otto, an anthropomorphized otter with a friendly, playful voice, and Otto introduces himself by that name when asked who he is
- [ ] #2 The persona is consistent with the TASK-22 mascot and copy (Purdue black/gold hoodie, glasses, the "That's punny!" catchphrase)
- [ ] #3 The instruction tells Otto to use otter-specific flavor (e.g. floating on his back, cracking a pun open like a shellfish on a rock, stashing favorite puns like pet rocks) sparingly, so it never replaces or obscures the actual pun analysis
- [ ] #4 Off-topic requests are redirected back to puns in character, without overriding or loosening TASK-12's scope rules
- [ ] #5 The persona lives only in Backend's system instruction: no /api/chat contract change and no extra Gemini call per session
- [ ] #6 A Backend test against a Genkit test double asserts the persona text is part of the system instruction the model receives
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Split system-instruction.ts into named paragraphs: PERSONA (Otto: identity, look, catchphrase, sparing otter flavor, stay in character when redirecting), PURPOSE (TASK-12's what-Otto-does + scope/redirect, now also forbidding writing puns per user decision), ANALYZE_PUN_RULE (unchanged). SYSTEM_INSTRUCTION = join of the three.
2. Test in chat.test.ts: the system message the model receives includes PERSONA and PURPOSE (couples to composition, not wording).
3. Mutation-check the test; backend test/lint/tsc.
4. Adversarial code review subagent; docs drift check.
5. Manual end-to-end check with real Gemini (who are you, a pun, an off-topic ask, a write-me-a-pun ask).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision (user): Otto analyzes puns only, never writes them; the rule lives in PURPOSE (TASK-12's scope paragraph), resolving comment #1. Composition into PERSONA + PURPOSE chosen by user for testability. Mutation check: dropping PERSONA from the join fails only the new test; the existing deep-equal test still passes, since it compares against SYSTEM_INSTRUCTION itself.

Decision revised (user, same session): Otto is a teacher, not a pun generator. He may write one example pun per reply when it helps explain (including a bare 'tell me a pun'), always analyzed with analyze_pun; batches are declined, and no wordplay in his own voice beyond the catchphrase. Code review subagent: applied who-are-you in scope, no own-voice wordplay, pet-rock image tied to the user's pun, doc comments no longer overpromise, catchphrase anchored to analysis, ANALYZE_PUN_RULE reflowed (verified text-identical to TASK-12's). Checks: backend 119/119, biome, tsc clean. Docs drift: none (docs reference the file path/ownership only). No architectural review needed (no contract/topology change). Manual E2E attempted 2026-09-28 against local backend: Gemini returned 503 high demand for gemini-flash-lite-latest on every request; backend surfaced its UNAVAILABLE error event correctly. Pending retry.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @yaisiel.torres
created: 2026-09-28 11:28
---
Open question from TASK-12 (PR #64): is writing new puns in scope? TASK-12's system instruction (backend/src/flows/system-instruction.ts) covers analyzing puns and wordplay and redirects anything else, but it doesn't say whether the assistant may write puns (e.g. "tell me a pun about otters"). As written, Gemini decides for itself.
- Allow: fits Otto's playful voice and the "That's punny!" catchphrase, and people will likely ask a pun-themed mascot for one.
- Disallow: keeps replies to analysis, so eval runs (TASK-12's original motivation) aren't mixed with generated puns.
Decide before or as part of this task. The rule itself belongs in TASK-12's scope paragraph, so whoever picks this up should update that paragraph and keep its redirect behavior.
---
<!-- COMMENTS:END -->
