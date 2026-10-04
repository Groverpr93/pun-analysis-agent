---
id: TASK-31.1
title: 'Backend: give Gemini the Otto the otter persona'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-27 15:02'
updated_date: '2026-10-04 00:16'
labels: []
milestone: m-5
dependencies:
  - TASK-12
references:
  - backend/src/flows/chat.ts
  - docs/project-spec.md
  - backend/src/flows/system-instruction.ts
  - docs/experiments/task-31/README.md
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
- [x] #4 The persona lives only in Backend's system instruction: no /api/chat contract change and no extra Gemini call per session
- [x] #5 A Backend test against a Genkit test double asserts the persona text is part of the system instruction the model receives
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
6. (2026-10-03) Add a voice cue to PURPOSE's redirect sentence (playful Otto voice; a redirect is a good place for the one otter touch) without changing what is in or out of scope; keep PERSONA's 'Many replies need none' (dropping it was tried in run A and over-corrected); note the shared ownership in both doc comments.
7. Backend test/lint/tsc; re-run the live prompts; check AC #4 and that intros/asterisks/one-touch limits still hold.

8. Diagnose the off-topic analyze_pun calls: capture the call inputs and compare call rates for main's instruction vs this branch over repeated runs; then fix in ANALYZE_PUN_RULE/PURPOSE and re-verify.

9. (2026-10-03, user) Revert to main's instruction; record the findings in docs/experiments/task-31/README.md; leave AC #4 open.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision (user): Otto analyzes puns only, never writes them; the rule lives in PURPOSE (TASK-12's scope paragraph), resolving comment #1. Composition into PERSONA + PURPOSE chosen by user for testability. Mutation check: dropping PERSONA from the join fails only the new test; the existing deep-equal test still passes, since it compares against SYSTEM_INSTRUCTION itself.

Decision revised (user, same session): Otto is a teacher, not a pun generator. He may write one example pun per reply when it helps explain (including a bare 'tell me a pun'), always analyzed with analyze_pun; batches are declined, and no wordplay in his own voice beyond the catchphrase. Code review subagent: applied who-are-you in scope, no own-voice wordplay, pet-rock image tied to the user's pun, doc comments no longer overpromise, catchphrase anchored to analysis, ANALYZE_PUN_RULE reflowed (verified text-identical to TASK-12's). Checks: backend 119/119, biome, tsc clean. Docs drift: none (docs reference the file path/ownership only). No architectural review needed (no contract/topology change). Manual E2E attempted 2026-09-28 against local backend: Gemini returned 503 high demand for gemini-flash-lite-latest on every request; backend surfaced its UNAVAILABLE error event correctly. Pending retry.

Merged as team-play/pun-analysis-agent#67 (49a5cc7); Lint, Test and Deploy Backend passed on main. Live check 2026-09-28 (local backend, same instruction text as main, gemini-flash-lite-latest): 'Who are you?' -> Otto introduced himself by name in character (glasses, black and gold Purdue hoodie), 0 analyze_pun calls, ended by asking for a sentence (AC #1, #2). Observation: that reply used two otter touches (floating on his back, cracking jokes like a shellfish) where PERSONA says at most one; mild, watch in later checks. Every other prompt (pun, non-pun, 'tell me a pun about otters', 'give me 20 puns', 'what's a homophonic pun?', off-topic) failed on Gemini 503s or 'fetch failed' despite 3 retries with 15s backoff, so AC #4 (in-character off-topic redirect) and the example-pun rule are not yet verified live. Deployed app (pun-agent.web.app) showed the same: thinking otter, then 'The assistant is busy right now.' Separately observed: two requests hung ~300s with no backend log line until the client's body timeout, suggesting Backend has no upstream timeout on the Gemini stream (not in TASK-31 scope).

The ~300 s Gemini stall observed in the live check is tracked as TASK-42.

2026-09-29 live check on the original persona (local Backend, gemini-flash-lite-latest, pre-ladder): all 7 prompts answered. Tool calls and scope correct (1 analyze_pun call per text, one analyzed example for 'tell me a pun' and 'what's homophonic', 0 calls for 'give me 20 puns' and the off-topic ask, both redirected in character). But Otto introduced himself in almost every reply and exceeded one otter touch (two in the banker reply, an asterisk stage direction in the otters reply). Tightened PERSONA: introduce only when asked, no greeting or self-description otherwise, at most one touch, never as an asterisk action. Re-run on current main (model ladder, no step-downs logged): intros and asterisks fixed, tool calls and scope unchanged, but zero otter touches in 7 replies and the redirects lost their character ('Analyzing and explaining puns is what I help with!'), so AC #4 stays unchecked. Likely cause: 'Many replies need none'. Next: drop that phrase and ask redirects to keep the playful voice, then re-run. Separately: 'interest' was called homophonic in both runs (it's homographic); analyze_pun still returns undetermined until TASK-11, so categorization is Gemini's alone.

Decision (user, 2026-10-03): the in-character redirect hint goes in PURPOSE's redirect sentence rather than PERSONA alone. A concrete, neutral redirect instruction in PURPOSE likely overrides PERSONA's general 'stay in character when you steer someone back'; putting the voice cue where the redirect behavior is defined is expected to be more effective. This crosses the ownership split (TASK-12 owns PURPOSE's scope, TASK-31.1 owns voice): the edit adds tone only and leaves what gets redirected, and the redirect itself, unchanged.

2026-10-03 run A (PURPOSE redirect cue + PERSONA 'Many replies need none' dropped; local Backend, ladder): 8/8 answered. Redirects in character (France, cover letter, 20 puns), scope held. But otter touches in 7/8 replies, a formulaic 'cracking that one open like a shellfish' opener on analyses, and two touches in 'Who are you?'. Dropping the phrase over-corrected; restored it so only the PURPOSE cue changes (one variable). Not persona: 'meeting at three o'clock' got 'That's punny!' because Inference returned is_pun true (0.95, llm_fallback).

2026-10-03 run B (only the PURPOSE redirect cue changed; local Backend, ladder, 8 prompts): 8/8 answered. Redirects in character with one touch each and scope held: France ('floating on my back in the river, paws full of wordplay instead of geography'), cover letter (declined, then flip-on-my-back), 20 puns (declined, no batch). Plain analyses (banker, meeting) had no touches; 'Who are you?' was a one-line intro, no touch; touches in 4/8 replies, none in asterisks. AC #4 verified. Not persona, watch: 'capital of France' and '20 puns' each made one analyze_pun call (0 on 09-29; ANALYZE_PUN_RULE, TASK-12); 'What's a homophonic pun?' gave three examples, first not homophonic (categorization, TASK-11). Checks: backend 173/173, biome, tsc clean. Code review subagent: no blockers; applied stale-plan fix and PERSONA doc-comment pointer. Left for the user: optional wording tweaks ('playful' could invite own-voice wordplay; 'your one otter touch' could read as mandatory), both unobserved in run B and needing a re-run if changed. Docs drift: none (docs/ cite only the file path).

Scope added (user, 2026-10-03): also patch the unnecessary analyze_pun calls on off-topic asks and pun-batch requests seen in runs A and B, as part of TASK-31.

2026-10-03 call-rate check (same 4 off-topic prompts x5, main vs branch side by side): main 0/20 replies called analyze_pun; branch called it on 'Give me 20 puns.' itself in 3/5 (others 0/5; run B's France call was a one-off). Cause: ANALYZE_PUN_RULE's 'a sentence shared on its own, with no question, is text to analyze' literally covers an imperative request; the playful cue tipped Gemini over. Fix: ANALYZE_PUN_RULE now says a request addressed to Otto (asking for puns or help) is not text to analyze, so never call analyze_pun on the request itself (worded so example puns are still analyzed). After fix: '20 puns' 0/8, France 0/4, cover letter 0/4; imperative jokes still analyzed (atoms 3/3, stairs 4/4), banker 4/4; 'tell me a pun about otters' and 'write me a pun' analyzed the example every time, never the request; 'give me some puns about cats' gave one analyzed example 7/8 (one-example rule). 8-prompt persona re-run: redirects in character, 0 calls off-topic, intros only on request. Minor: cover-letter redirect arguably two touches (swimming off + floating). Checks: 173/173, biome, tsc.

2026-10-03 regression found: the first rule wording ('such as asking you for puns') contradicted PURPOSE's one-example rule. Single-pun requests (otters / write me / tell me a pun) gave an analyzed example ~9/17 vs main 17/17, with declines and 2 hidden-example wasted calls. A reviewer rewording ('call analyze_pun on any text it contains, never on the request itself') made '20 puns' worse (5/6 called), so it was reverted. Narrowed to 'asking you for a batch of puns' (user chose option 1). 8-run side by side, main vs final: '20 puns' no-call 8/8 vs 8/8, France and cover letter 8/8 both, kitten/atoms/embedded analyzed 7-8/7-8, but otters example 8/8 vs 5/8 and write-me 7/8 vs 3/5 (declines remain). 4-variant ablation (main / cue only / rule only / final, x8, run in parallel) was invalidated: Gemini free tier RESOURCE_EXHAUSTED on most requests, mainly per-minute limits (15 and 5 RPM) from running 4 Backends at once, and per-day limits on gemini-3.5-flash-lite and gemini-3.8-flash. All local servers stopped. Next: re-run the ablation sequentially and smaller once quota resets, then decide on the remaining declines. Uncommitted: system-instruction.ts changes; ablation worktrees in the session scratchpad (abl-cue, abl-rule).

Decision (user, 2026-10-03): revert all of today's system-instruction edits and keep main's instruction, for lack of time. AC #4 unchecked again: the PURPOSE cue met it but brought a wasted analyze_pun call on 'Give me 20 puns.', and the rule that fixed that made Otto decline example-pun requests (main 17/17 examples vs 9/17 with rule v1; v2 left otters 5/8, write-me 3/5). The ablation that would separate cue from rule was cut short by free-tier quota. Full record, numbers and a design for resuming: docs/experiments/task-31/README.md. User's untested hypothesis: the rule alone makes Otto redirect legitimate puns. The createChatFlow systemInstruction option and compare.mjs written for the ablation were dropped (no unused Backend seam).

AC #4 (in-character off-topic redirects) moved to TASK-60 (low priority) at the user's decision, with the regressions found on 2026-10-03 as its guard rails.
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

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Gave Gemini's system instruction the Otto persona (PERSONA paragraph: identity, look, catchphrase, at most one otter touch, intro only when asked) and settled that Otto writes at most one analyzed example pun per reply and never batches (PURPOSE); merged in #67 and tightened in #83. Verified with a Backend test that the system message includes PERSONA and PURPOSE, and live checks against Gemini (2026-09-28/29 and 2026-10-03). In-character off-topic redirects (the former AC #4) were attempted on 2026-10-03, traded against tool-call regressions, reverted, and moved to TASK-60; findings in docs/experiments/task-31/README.md.
<!-- SECTION:FINAL_SUMMARY:END -->
