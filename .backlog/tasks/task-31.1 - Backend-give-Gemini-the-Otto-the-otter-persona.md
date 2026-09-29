---
id: TASK-31.1
title: 'Backend: give Gemini the Otto the otter persona'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-27 15:02'
updated_date: '2026-09-29 23:06'
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
- [x] #1 The system instruction presents the assistant as Otto, an anthropomorphized otter with a friendly, playful voice, and Otto introduces himself by that name when asked who he is
- [x] #2 The persona is consistent with the TASK-22 mascot and copy (Purdue black/gold hoodie, glasses, the "That's punny!" catchphrase)
- [x] #3 The instruction tells Otto to use otter-specific flavor (e.g. floating on his back, cracking a pun open like a shellfish on a rock, stashing favorite puns like pet rocks) sparingly, so it never replaces or obscures the actual pun analysis
- [ ] #4 Off-topic requests are redirected back to puns in character, without overriding or loosening TASK-12's scope rules
- [x] #5 The persona lives only in Backend's system instruction: no /api/chat contract change and no extra Gemini call per session
- [x] #6 A Backend test against a Genkit test double asserts the persona text is part of the system instruction the model receives
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
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

Merged as team-play/pun-analysis-agent#67 (49a5cc7); Lint, Test and Deploy Backend passed on main. Live check 2026-09-28 (local backend, same instruction text as main, gemini-flash-lite-latest): 'Who are you?' -> Otto introduced himself by name in character (glasses, black and gold Purdue hoodie), 0 analyze_pun calls, ended by asking for a sentence (AC #1, #2). Observation: that reply used two otter touches (floating on his back, cracking jokes like a shellfish) where PERSONA says at most one; mild, watch in later checks. Every other prompt (pun, non-pun, 'tell me a pun about otters', 'give me 20 puns', 'what's a homophonic pun?', off-topic) failed on Gemini 503s or 'fetch failed' despite 3 retries with 15s backoff, so AC #4 (in-character off-topic redirect) and the example-pun rule are not yet verified live. Deployed app (pun-agent.web.app) showed the same: thinking otter, then 'The assistant is busy right now.' Separately observed: two requests hung ~300s with no backend log line until the client's body timeout, suggesting Backend has no upstream timeout on the Gemini stream (not in TASK-31 scope).

The ~300 s Gemini stall observed in the live check is tracked as TASK-42.

2026-09-29 live check on the original persona (local Backend, gemini-flash-lite-latest, pre-ladder): all 7 prompts answered. Tool calls and scope correct (1 analyze_pun call per text, one analyzed example for 'tell me a pun' and 'what's homophonic', 0 calls for 'give me 20 puns' and the off-topic ask, both redirected in character). But Otto introduced himself in almost every reply and exceeded one otter touch (two in the banker reply, an asterisk stage direction in the otters reply). Tightened PERSONA: introduce only when asked, no greeting or self-description otherwise, at most one touch, never as an asterisk action. Re-run on current main (model ladder, no step-downs logged): intros and asterisks fixed, tool calls and scope unchanged, but zero otter touches in 7 replies and the redirects lost their character ('Analyzing and explaining puns is what I help with!'), so AC #4 stays unchecked. Likely cause: 'Many replies need none'. Next: drop that phrase and ask redirects to keep the playful voice, then re-run. Separately: 'interest' was called homophonic in both runs (it's homographic); analyze_pun still returns undetermined until TASK-11, so categorization is Gemini's alone.
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
