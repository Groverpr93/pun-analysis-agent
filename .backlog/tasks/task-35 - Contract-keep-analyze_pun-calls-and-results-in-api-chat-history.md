---
id: TASK-35
title: 'Contract: keep analyze_pun calls and results in /api/chat history'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-27 18:55'
updated_date: '2026-09-28 11:10'
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
- [ ] #1 docs/contracts.md specifies how a previous turn's analyze_pun calls and results are sent in the /api/chat request, agreed by Backend and Frontend, including how older clients sending string-only content keep working
- [ ] #2 Frontend resends each earlier analyze_pun call and its result in that shape instead of dropping it, unit-tested with a history containing a completed call
- [ ] #3 Backend accepts the new shape and passes the earlier calls and results to Gemini as tool history, tested against a Genkit test-double model that receives them
- [ ] #4 A follow-up question about an earlier analysis is answered from that analysis in the running app
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
- [ ] #4 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #5 Architectural review done (this changes the /api/chat contract)
- [ ] #6 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. docs/contracts.md: content becomes string | Part[]; Part = {type:'text', text} | {type:'tool-call', name:'analyze_pun', ref, input:{text}, output:<the /analyze shape>}. Tool-call parts only on assistant messages; a string stays valid (older clients); unanswered calls are never sent; consecutive calls = one parallel batch; results are client-supplied, shape-checked only (trust note, HMAC as the upgrade path). Remove the Known limitation paragraph.
2. Backend chat.ts: chatInputSchema union, reusing analyze-pun.ts's analyzeResultSchema and tool input schema; toGenkitMessages splits an assistant message into model -> tool -> model messages. output is required, so a call without a result is rejected.
3. Backend tests against a Genkit test-double model recording what it receives: text before a call, parallel calls, text after; string-only history; 400 for a tool-call part on a user message, malformed output, missing output.
4. Frontend: replace the text-only request mapping with one that keeps text parts and answered analyze_pun calls (renamed to the contract's fields) and drops unanswered ones; unit-test with a history holding an answered and an unanswered call.
5. Verify: one real Gemini request with resent tool history (thought-signature question); AC #4 in the running app; lint + test both packages.
6. Architectural review + adversarial code review subagents; docs drift check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented contract (docs/contracts.md), Backend schema + toGenkitReplyMessages (chat.ts, reusing analyze-pun.ts schemas), Frontend toChatRequestMessage (request-messages.ts). Backend 111/111, Frontend 140/140, tsc + biome clean. Mutation checks: optional output, no turn split on text, parts on any role, any tool name, dropping the /analyze superRefine rules (Backend); dropping the result check and the tool-name check (Frontend) each fail a test.
Real Gemini (gemini-flash-lite-latest, scratch script): resent tool history without thought signatures accepted for refs 'call_1' and '0'; follow-up answered from the resent result with 0 new tool calls. Text-only control re-called analyze_pun (1 call) despite being told not to, so the change also saves an Inference call per grounded follow-up.
AC #4 in the running app (local Backend with fixture Inference + live Frontend): follow-up 'what exactly did it return?' answered from the undetermined result, no new tool call.

Reviews: code review found no bugs; added tests it showed were missing (text parts that follow each other, an empty reply, a route test that accepts a valid history, a Frontend reply that held only an unanswered call). Checked with real Gemini: two user turns in a row and an empty text part are both accepted, so no empty-text handling was added. Backend 114/114, Frontend 141/141. Architectural review: engineering-practices.md requires Backend (consumer) to deploy before Frontend starts sending parts; the other open question is whether one invalid resent output should reject the whole request (old localStorage threads). Both are pending with the user.

Decision (user): a resent output that breaks the /analyze rules is dropped with its result and logged as a WARNING (path+code of up to 5 issues only, never client values), not rejected; structural errors still 400. Follow-up review: added a route test (the route's safeParse enforces superRefine rules the flow's JSON-schema check drops) and bounded the warning; Backend 116/116, each new rule mutation-checked. Shipping as two PRs per engineering-practices.md's consumer-first deploy rule: PR 1 contract + Backend, PR 2 Frontend after PR 1 is live on Cloud Run. docs/project-spec.md sync point 1 now names Frontend as depending on the /analyze shape.
<!-- SECTION:NOTES:END -->
