---
id: TASK-45
title: 'Backend: check chat continuity across the model ladder''s models'
status: In Progress
assignee:
  - '@yaisiel.torres'
created_date: '2026-09-28 19:54'
updated_date: '2026-09-29 09:06'
labels: []
dependencies:
  - TASK-43
references:
  - docs/contracts.md
  - backend/src/flows/model-ladder.ts
  - backend/src/config.ts
  - docs/experiments/task-38/README.md
priority: medium
type: task
project: backend
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-43 made /api/chat step down a ladder of models (gemini-flash-lite-latest -> gemini-3.1-flash-lite -> gemini-2.5-flash-lite) when one fails. Within a reply the model is pegged, so the thought signatures Gemini checks on that reply's own tool calls always come from the model that made them. Across replies nothing pins the model: a follow-up can be answered by a different model than the one that made the earlier reply's analyze_pun calls, and Frontend resends those calls as history without their signatures (docs/contracts.md, "No thought signatures"). TASK-35 confirmed that Gemini accepts unsigned resent calls, but only against gemini-flash-lite-latest. Nobody has checked whether the two lower models accept another model's unsigned history, or that they answer with this project's API key at all (gemini-2.5-flash-lite is access-restricted to projects that used it before). If either fails, a follow-up that steps down fails instead of being rescued.

Timing measurements for these models stay in TASK-32 (AC #4). This task is only about whether a conversation keeps working when the model changes between replies.

Useful context: TASK-35 checked with a scratch script against real Gemini; TASK-38's P4 -> P5 prompt pair (docs/experiments/task-38/) has the shape needed, a reply with analyze_pun calls followed by a follow-up about them. Setting GEMINI_MODEL on a local Backend limits /api/chat to one model, which forces a given turn onto a given model. Quota is per model on the free tier, so this spends the lower models' quota, not production's.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Both kinds of ref are covered: a Gemini-supplied call id and a Backend-numbered one ("0")
- [x] #2 docs/contracts.md's "No thought signatures" bullet records the models checked and drops its "not yet" wording; if a model rejects the history, what happens to the follow-up is recorded there and a fix is agreed with the user before this task closes
- [ ] #3 Each model on the ladder accepts a follow-up whose history (analyze_pun calls and results, resent without thought signatures as Frontend sends them) was made by another model, and answers it; recorded in docs/experiments/task-45 with the date
- [x] #4 The ladder is gemini-3.5-flash-lite -> gemini-3.1-flash-lite -> gemini-3.8-flash (user decisions, 2026-09-28/29), replacing gemini-2.5-flash-lite, which Gemini answers with 404 for this project; config.ts, its test, and the docs that name the ladder match
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. docs/experiments/task-45/check.mjs: against three local Backends, each pinned to one ladder model (GEMINI_MODEL + PORT 8081/8082/8083, APP_CHECK=off, fixture Inference), using the main checkout's backend/.env.local key (pun-agent project, confirmed by the user).
2. First turn: TASK-38's P4 to each model (AC #1 for the lower two), saving each raw stream.
3. Rebuild each first-turn reply as contract parts (text, tool-call {name, ref, input, output}, text), which have no field for thought signatures, as Frontend sends them.
4. Follow-ups: latest->3.1, latest->2.5, 3.1->latest, 2.5->latest, each with the Gemini-supplied ref and with it rewritten to "0" (AC #2-#4). The follow-up asks what analyze_pun returned, which only the resent output answers (the fixture's undetermined result). Pass = stream ends in result, no new analyze_pun call, reply matches the undetermined result.
5. Record results (date, per-pair outcome) in docs/experiments/task-45/README.md, contracts.md's No thought signatures bullet, and task notes; if a model rejects the history, stop and agree a fix with the user.
6. Code review + architectural review (touches contracts.md) subagents; docs drift check.

Revised 2026-09-28 after the first run (user decisions): gemini-2.5-flash-lite 404s for this project, so the ladder becomes gemini-3.8-flash -> gemini-3.5-flash-lite -> gemini-3.1-flash-lite. The goal is only that a conversation started on one model continues on another: the resent history has no signatures, so the receiving model can't tell who made it, and the check sends each model a reply made by its neighbour on the ladder (Flash only receives), with both ref kinds. A follow-up passes when it's answered. Each run is saved to runs/<time>/. Flash's final run waits for its daily quota to reset.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-28 first run (docs/experiments/task-45/check.mjs, local key in the pun-agent project):
- gemini-flash-lite-latest and gemini-3.1-flash-lite answered a plain request (1 analyze_pun call each). latest hit 503s on some attempts and the ladder's backoff got it through.
- gemini-2.5-flash-lite fails every request: Gemini returns 404 NOT_FOUND 'This model models/gemini-2.5-flash-lite is no longer available to new users' (confirmed with a direct generateContent call). config.ts's claim that this project can still use it doesn't hold for this key. In the ladder, NOT_FOUND is a 'fail' action, so a reply that steps down to it fails with NOT_FOUND (UNKNOWN to the user) instead of the 503/429 error it stepped down from.
- Unsigned history accepted both ways between latest and 3.1, for a Gemini ref and for '0', with 0 new analyze_pun calls. 3 of 4 replies reported the resent undetermined result; latest->3.1 with ref '0' instead claimed the tool 'confirmed' homophony (taken from the earlier reply's text, not the result). One sample each, so it's unclear whether that's the ref or chance.

2026-09-28 later: ladder changed to gemini-3.8-flash -> gemini-3.5-flash-lite -> gemini-3.1-flash-lite (user decision; config.ts, genkit.test.ts, .env.example, local-setup.md, contracts.md's ladder bullet). Backend 166/166, tsc + Biome clean. check.mjs simplified (user): reads the ladder from config.ts, sends each model a reply made by its ladder neighbour (Flash only receives), both ref kinds, pass = answered; runs saved to runs/<time>/ (an earlier new-ladder run's recordings were overwritten before this; its Flash results are only in README as uncounted). docs/experiments/read-stream.mjs now shared with task-38/record.mjs. New-ladder run 20:23 UTC: 3.5 <-> 3.1 accept each other's unsigned history with both refs; Flash 429 throughout. No history rejection seen on any model. Pending: final run once Flash's daily quota resets (user reported it reached), then contracts.md's No thought signatures bullet, reviews, and docs drift check.

2026-09-29 08:40 UTC run (runs/2026-09-29T08-40-25.123Z): 3.5 <-> 3.1 answered all 4 follow-ups (both refs). Flash's 2 follow-ups failed after 3 attempts each (UNAVAILABLE, and DEADLINE_EXCEEDED = stalled past MODEL_STALL_LIMIT_MS), with 4 keepalives each, so they were retried: capacity, not a rejected history (a 400 fails at once). A direct 'Say hi.' to gemini-3.8-flash right after also got 503. Production consequence of Flash on top: 3 stalls on Flash spend ~93 s (3 x 30 s stall + waits) against RETRY_BUDGET_MS 80 s, so the reply fails instead of stepping down to 3.5; with fast 503s it steps down after ~10 s.

2026-09-29: ladder changed again (user) to gemini-3.5-flash-lite -> gemini-3.1-flash-lite -> gemini-3.8-flash after Flash stalled (3 stalls on the top rung exceed RETRY_BUDGET_MS, failing the reply without a step-down). Final run 08:47 UTC: 3.5 and 3.1 answered all 4 follow-ups (both refs); Flash capacity failures again. Flash left unverified -> TASK-46 (user decision). Grounding: 3.1 misreported the undetermined result in 5/8 cross-model follow-ups (both ref kinds); latest 2/2 and 3.5 4/4 reported it. Self-check (check.mjs --from/--to 3.1, 3 runs): 0/5 grounded with its own history, so it's 3.1, not the hand-off. Recorded in README; contracts.md's No thought signatures bullet finalized.

Correction: 3.5 reported the empty result in 5/5 follow-ups, not 4/4 (20:23 run's Gemini-ref follow-up counts too). Reviews (code + architectural, subagents): no blocking issues; toReplyParts matched Frontend's applyMessage + request mapping on all 45 recorded streams, and check.mjs now uses Frontend's applyMessage directly. Fixed: results.json write after a Backend start failure (dirs made first), refusing to start when a port is already taken, README counts/wording tied to recorded statuses (a rejection is INVALID_ARGUMENT; 429s aren't retried under a pinned model), unrecorded claims labelled, config.ts attribution (3.1 from TASK-43), contracts wording ('in TASK-45's recorded runs'; Flash pegging + 429 clause), stall-limit comment notes it's unchecked for Flash. Runs share production's per-project quota, noted in README.

AC #3 left unchecked by design (user decision, 2026-09-29): verified for gemini-3.5-flash-lite and gemini-3.1-flash-lite; gemini-3.8-flash never answered in the recorded runs (capacity/quota only, no rejection), carried by TASK-46. Final checks: backend 166/166, packages/timeouts 7/7, tsc + Biome clean. Docs drift: README.md, project-spec.md, engineering-practices.md, AGENTS.md don't name the ladder's models; local-setup.md and contracts.md updated in this change.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Checked that an /api/chat conversation keeps working when the ladder answers a follow-up with a different model than the earlier reply's (history resent without thought signatures). The check is docs/experiments/task-45/check.mjs: it runs one local Backend per model, rebuilds replies with Frontend's own applyMessage, and saves each run under runs/. Findings: gemini-2.5-flash-lite 404s for this project, so the ladder is now gemini-3.5-flash-lite -> gemini-3.1-flash-lite -> gemini-3.8-flash. Flash went to the bottom because its stalls on the top rung would spend the whole retry budget before a step-down. Both Flash-Lite models accept each other's unsigned history with Gemini-supplied and '0' refs. No model rejected history in any run. Flash is unverified (capacity/quota failures only) and goes to TASK-46. Side finding: gemini-3.1-flash-lite often misreports the resent result, with its own history as much as another's, so it's the model and not the hand-off. contracts.md, config.ts, local-setup.md and .env.example updated. Verified by the recorded runs, backend 166/166 and timeouts 7/7 tests, plus code and architectural reviews.
<!-- SECTION:FINAL_SUMMARY:END -->
