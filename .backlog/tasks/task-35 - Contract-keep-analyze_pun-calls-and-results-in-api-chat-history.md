---
id: TASK-35
title: 'Contract: keep analyze_pun calls and results in /api/chat history'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-27 18:55'
updated_date: '2026-09-28 11:32'
labels: []
dependencies:
  - TASK-9
  - TASK-10
references:
  - docs/contracts.md
  - frontend/src/lib/chat/message-text.ts
  - backend/src/flows/chat.ts
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in TASK-10's reviews (2026-09-27). The /api/chat request is { messages: [{ role, content: string }] } (docs/contracts.md), so when Frontend resends the conversation each turn, frontend/src/lib/chat/message-text.ts keeps only text parts: an assistant message's analyze_pun tool-call parts (the analyzed text and Inference's /analyze result) are dropped, and Backend's chatInputSchema (backend/src/flows/chat.ts) couldn't accept them anyway. So on the next turn Gemini no longer knows what it analyzed or what Inference returned, and a follow-up like 'why did you say that was a pun?' loses its grounding. Persisted threads (localStorage) already store the tool-call parts, so the data exists on the Frontend side. This changes the /api/chat request contract, so both sides agree it in contracts.md first (AGENTS.md's Architectural review applies).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/contracts.md specifies how a previous turn's analyze_pun calls and results are sent in the /api/chat request, agreed by Backend and Frontend, including how older clients sending string-only content keep working
- [x] #2 Frontend resends each earlier analyze_pun call and its result in that shape instead of dropping it, unit-tested with a history containing a completed call
- [x] #3 Backend accepts the new shape and passes the earlier calls and results to Gemini as tool history, tested against a Genkit test-double model that receives them
- [x] #4 A follow-up question about an earlier analysis is answered from that analysis in the running app
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
- [x] #4 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #5 Architectural review done (this changes the /api/chat contract)
- [x] #6 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. docs/contracts.md: content becomes string | Part[]; Part = {type:'text', text} | {type:'tool-call', name:'analyze_pun', ref, input:{text}, output:<the /analyze shape>}. Tool-call parts only on assistant messages; a string stays valid (older clients); unanswered calls are never sent; consecutive calls = one parallel batch; results are client-supplied, shape-checked only (trust note, HMAC as the upgrade path). Remove the Known limitation paragraph.
2. Backend chat.ts: chatInputSchema union, reusing analyze-pun.ts's analyzeResultSchema and tool input schema; toGenkitMessages splits an assistant message into model -> tool -> model messages. output is required, so a call without a result is rejected.
3. Backend tests against a Genkit test-double model recording what it receives: text before a call, parallel calls, text after; string-only history; 400 for a tool-call part on a user message, malformed output, missing output.
4. Frontend: replace the text-only request mapping with one that keeps text parts and answered analyze_pun calls (renamed to the contract's fields) and drops unanswered ones; unit-test with a history holding an answered and an unanswered call.
5. Verify: one real Gemini request with resent tool history (thought-signature question); AC #4 in the running app; lint + test both packages.
6. Architectural review + adversarial code review subagents; docs drift check.

7. Revised after review (user decision): a resent output that breaks the /analyze rules is left out with its result and logged (not rejected); structural errors still 400. Shipped as two PRs, Backend (#62) before Frontend (#63), per engineering-practices.md's consumer-first deploy rule. Also reworded analyze_pun's tool description so follow-ups don't re-call Inference.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented contract (docs/contracts.md), Backend schema + toGenkitReplyMessages (chat.ts, reusing analyze-pun.ts schemas), Frontend toChatRequestMessage (request-messages.ts). Backend 111/111, Frontend 140/140, tsc + biome clean. Mutation checks: optional output, no turn split on text, parts on any role, any tool name, dropping the /analyze superRefine rules (Backend); dropping the result check and the tool-name check (Frontend) each fail a test.
Real Gemini (gemini-flash-lite-latest, scratch script): resent tool history without thought signatures accepted for refs 'call_1' and '0'; follow-up answered from the resent result with 0 new tool calls. Text-only control re-called analyze_pun (1 call) despite being told not to, so the change also saves an Inference call per grounded follow-up.
AC #4 in the running app (local Backend with fixture Inference + live Frontend): follow-up 'what exactly did it return?' answered from the undetermined result, no new tool call.

Reviews: code review found no bugs; added tests it showed were missing (text parts that follow each other, an empty reply, a route test that accepts a valid history, a Frontend reply that held only an unanswered call). Checked with real Gemini: two user turns in a row and an empty text part are both accepted, so no empty-text handling was added. Backend 114/114, Frontend 141/141. Architectural review: engineering-practices.md requires Backend (consumer) to deploy before Frontend starts sending parts; the other open question is whether one invalid resent output should reject the whole request (old localStorage threads). Both are pending with the user.

Decision (user): a resent output that breaks the /analyze rules is dropped with its result and logged as a WARNING (path+code of up to 5 issues only, never client values), not rejected; structural errors still 400. Follow-up review: added a route test (the route's safeParse enforces superRefine rules the flow's JSON-schema check drops) and bounded the warning; Backend 116/116, each new rule mutation-checked. Shipping as two PRs per engineering-practices.md's consumer-first deploy rule: PR 1 contract + Backend, PR 2 Frontend after PR 1 is live on Cloud Run. docs/project-spec.md sync point 1 now names Frontend as depending on the /analyze shape.

Tool description reword (#62): analyze_pun calls per reply on gemini-flash-lite-latest, 3 runs each, before -> after: new phrase 1,1,1 -> 1,1,1; follow-up with resent history 0,0,0 -> 0,0,0; follow-up with text-only history 1,1,1 -> 0,0,0; new phrase later in the chat 1,1,1 -> 1,1,1. Ran into the 15 requests/minute free-tier limit, which the deployed app shares.
Deployed check (after #62 3ded50c and #63 656dc55 deploys succeeded): on pun-agent.web.app, the follow-up request carried the earlier reply as [tool-call analyze_pun ref=call_703344 is_pun=null, text] (captured request body), and 'What exactly did it return?' was answered as is_pun: null with no confidence or explanation, with no new tool call. That follow-up took 28.7s (Cloud Run request log); the next follow-up with the same resent history took 5.2s, so it was a one-off slow Gemini reply (the past 7 days' max was 19.6s). No 'left out' warnings or errors in the Backend logs.
Final checks on main 656dc55: Backend 116/116, Frontend 141/141, Biome clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The /api/chat request can now carry an earlier reply's analyze_pun calls and results. An assistant message's content can be an ordered list of text and tool-call parts, and plain strings still work for every role (docs/contracts.md). Backend (#62) rebuilds Gemini's turns from the parts, reusing analyze-pun.ts's schemas. Structural errors get a 400. A result that breaks the /analyze rules is left out and logged, so old saved threads keep working. Client-supplied results are only shape-checked (trust note in the contract, HMAC as the upgrade path). The analyze_pun description now says to answer follow-ups from the earlier result. Frontend (#63) resends answered calls, and drops unanswered ones and parts it has no shape for. Verified with Backend 116 and Frontend 141 tests, with every new rule mutation-checked; real-Gemini checks (no thought signatures needed; re-calls on follow-ups went from 3/3 to 0/3 for text-only history); an architectural review and two code reviews; and a follow-up on the deployed site answered from the resent result with no new tool call.
<!-- SECTION:FINAL_SUMMARY:END -->
