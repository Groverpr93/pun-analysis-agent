---
id: TASK-10
title: 'Frontend: parse and render analyze_pun tool-call events'
status: Done
assignee:
  - '@yaitorr'
created_date: '2026-09-17 23:34'
updated_date: '2026-10-04 20:57'
due_date: '2026-09-21'
labels: []
milestone: m-3
dependencies:
  - TASK-8
references:
  - docs/design/frontend-design.md
project: frontend
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extends the Phase 1 ChatModelAdapter to also parse tool-call stream events per the finalized shape in docs/contracts.md (sync point 3 per docs/project-spec.md, closed) and docs/design/frontend-design.md's 'Tool-call visibility' section. A pun explanation needs to read as clearly distinct from plain chat text.

Error scope: failures of /api/chat itself (network, non-2xx, quota and other Backend error events, cut-off streams, user stop) already show user-facing text via TASK-24; this task only covers how those failures settle an in-flight analyze_pun call. Inference failures and timeouts never reach Frontend as errors: Backend returns the undetermined result instead (TASK-9 AC #4), rendered per AC #6.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 assistant-ui shows the analyze_pun call live as it fires and resolves (running to complete)
- [x] #2 A resolved pun explanation is visually distinguished from plain chat text
- [x] #3 Adapter's tool-call parsing is unit-tested against recorded fixture events matching the Backend task's documented shape
- [x] #4 ChatModelAdapter creates one assistant-ui {type: 'tool-call', toolCallId, toolName, args, result} part per analyze_pun toolRequest part (a chunk can hold several) and sets its result from the toolResponse part with the same ref, per docs/contracts.md's pairing rule; unit-tested with parallel calls whose results arrive in the opposite order
- [x] #5 An llm_fallback result (empty explanation) renders as senses supplied by Gemini at lower confidence, backed by a stub fixture
- [x] #6 An undetermined result (is_pun: null) renders as 'Inference couldn't analyze this' with no confidence shown, checked with an explicit is_pun === null test (a truthiness check would show it as 'not a pun'), backed by a stub fixture; tool results are typed with a shared AnalyzeResult type (is_pun: boolean | null, confidence: number | null) so the compiler catches unhandled nulls
- [x] #7 A turn that ends after an analyze_pun toolRequest but before its toolResponse never leaves the call running: a Backend error event, dropped connection or missing result settles it as failed ('couldn't finish'), and a user stop settles it as cancelled; TASK-24's error box and wording are unchanged. Unit-tested with fixture streams that end right after a toolRequest, and each case checked in the running UI
- [x] #8 A slow analyze_pun stays visibly running with no Frontend timeout of its own; the wait is bounded by Backend's Inference timeout (INFERENCE_TIMEOUT_MS per call, set from a measured cold start by TASK-32 and recorded in docs/contracts.md)
- [x] #9 The stream parser accepts both a plain-string message and a Genkit-chunk message (docs/contracts.md's Phase 2 shape), and this task deploys before TASK-9 merges, so the live site never receives tool chunks it can't render
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Bring PR #47's Phase 2 contract docs to main with this task (consumer deploys first); mirror PR #47's TASK-10 AC rewrite.
2. Widen the flow-stream parser: message is a string or a Genkit chunk (AC #9).
3. reply-parts.ts: pure functions building assistant-ui parts; one tool-call part per ref, result set by ref (AC #4); a reply that finishes with an unanswered call is a broken stream (decided with @yaisiel.torres: option a).
4. Record fixtures from PR #47's Backend against real Gemini; hand-build parallel/opposite-order and ends-after-toolRequest streams (AC #3, #7).
5. AnalyzePunToolUI registered via a toolkit entry (backend, standalone): collapsed card with verdict, raw /analyze JSON on open (decided with @yaisiel.torres); summarizeAnalyzePunCall pure logic with explicit is_pun === null (AC #2, #5, #6). Failed/cancelled come from assistant-ui's message status (AC #7); no Frontend timeout (AC #8).
6. Stub scenarios for every state; check each in the running UI.
7. Syntax highlighting for reply code blocks and the card JSON (added scope, asked by @yaisiel.torres): assistant-ui's shiki-highlighter, lazily loaded, Purdue palette checked for WCAG AA.
8. Code review + architectural review subagents; docs drift check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Open contract question found in PR #27's architectural review (2026-09-23), recorded here rather than solved in TASK-8: docs/contracts.md's Phase 2 paragraph shows tool chunks as bare {"content": [...]} and says Backend 'doesn't re-wrap them', but backend/src/routes/chat.ts wraps every chunk as data: {"message": <chunk>}. So in Phase 2, tool chunks would arrive as data: {"message": {"content": [{"toolRequest": ...}]}}, and if the Phase 2 flow forwards Genkit's generate chunks instead of chunk.text, text chunks become objects too. Today's adapter (live-chat-model-adapter.ts: text + event.message) and GenkitFlowEvent's string type would then render '[object Object]' rather than fail loudly. Before implementing: agree the Phase 2 envelope and text-chunk shape with TASK-9 (Backend), update contracts.md's Phase 2 paragraph (contracts.md now marks message: string as Phase 1 only), and widen GenkitFlowEvent to match. Needs the architectural review in DoD #2.

Also from PR #27 review (2026-09-23): frontend/src/lib/chat/message-text.ts's getMessageText keeps only text parts, and live-chat-model-adapter.ts applies it to every message in history on each turn. Once assistant messages carry analyze_pun tool-call parts, resending history this way silently strips the tool call and its result, so Gemini loses that context on the next turn. Revisit this mapping together with the Phase 2 envelope above.

Deploy-order risk (2026-09-24, from TASK-8's architectural review): since TASK-8, the deployed site runs the Phase 1 live adapter, and deploy-backend.yml ships every backend/** push to main. So once TASK-9 merges, the live site receives the Phase 2 stream before this task updates the adapter; with the envelope question above, tool or text chunks could render as '[object Object]'. Decided with @yaisiel.torres: accepted, not a TASK-9 criterion or an engineering-practices exception, because TASK-9 and TASK-10 are expected to land back to back. Keep the gap short: pick this up right after TASK-9, and check the deployed site after TASK-9's backend deploy.

Deploy order (2026-09-27, decided with @yaisiel.torres in TASK-9 / PR #47): consumer first. This task builds on main against PR #47's Phase 2 contract (ref-based pairing, mixed string/Genkit-chunk message), which this PR brings to main with the contract docs; ACs #4, #8 and #9 mirror PR #47's rewrite. TASK-9 merges only after this task deploys. Until TASK-11, production's analyze_pun always returns the undetermined result, so every live tool call renders per AC #6.

Implemented in 5 commits (208f642..a09cc4b). Frontend tests 118/118, tsc and build clean. Mutation checks: removing the is_pun === null branch (2 tests fail), pairing by position instead of ref (2 fail), skipping the unanswered-call check (1 fails).
Running UI (stub, :5183): running, complete (pun/llm_fallback/undetermined/not-a-pun), couldn't finish + TASK-24 error box, cancelled via stop; dark and light; 375px wide with no horizontal overflow. Live (:5173 against PR #47's backend with real Gemini): card renders undetermined then Markdown reply; code block highlighted.
Gemini returned 503 high demand for the model turn after the tool result on 4 tries; that recording is kept as recordedToolCallThenErrorStream; a complete reply was recorded once Gemini recovered.
Bundle: Shiki eagerly added ~200 kB (65 kB gzip) to the main chunk; lazy-loaded it's +1.6 kB, with Shiki, its WASM and grammars in on-demand chunks.
Found pre-existing on main: thread viewport height grows without bound after the 2nd exchange; spun off as a separate task.

History resend (the PR #27 note above): deferred to TASK-35, since carrying tool calls in the request changes the /api/chat contract; recorded as a known limitation in docs/contracts.md.

Validation on main after merge (d4edbb1 #50, 83f547c #47), 2026-09-27: frontend 131/131, tsc clean; backend 99/99.
AC evidence: #1 running->complete in the stub UI and live against #47's Backend; #2 card with gold rule and tinted background, checked in both themes and at 375px; #3 parser and adapter tests replay three streams recorded from #47's Backend with real Gemini; #4 reply-parts tests (parallel calls, opposite-order results, split chunks); #5/#6 summarizeAnalyzePunCall tests plus stub fixtures, with an explicit is_pun === null test and a mutation check; #7 adapter tests for error event, clean end, dropped connection, missing result and user stop after a toolRequest, plus the stub's fail/slow scenarios checked in the UI; #8 the slow scenario stays running for 30s with no Frontend timeout.
AC #9: #50 and #47 were merged 1s apart (20:06:57/58Z), so both deploys ran from 83f547c. Firebase Hosting finished at 20:08:48Z, and the Cloud Run deploy started at 20:09:00Z, so the frontend was live first. That order came from the same commit and the frontend's faster pipeline, not from a gate. Deployed site checked: pun-agent.web.app renders the analyze_pun card (undetermined, as expected until TASK-11); Gemini's free-tier quota was exhausted for the follow-up model turn, which TASK-24's error box showed.
Follow-ups: TASK-35 (resend analyze_pun history); PR #50 review thread: Gemini accepts an empty assistant turn (checked against real Gemini), so no change.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Frontend renders Backend's analyze_pun tool calls (Phase 2). The /api/chat parser accepts both plain-text and Genkit-chunk messages. reply-parts.ts pairs each call with its result by ref, and treats unanswered, reused or missing refs as a broken stream. Each call shows as a collapsible card (verdict, pun probability, llm_fallback caveat, undetermined, couldn't finish/cancelled) with the raw /analyze JSON. Code blocks and the card JSON are syntax-highlighted in a lazily loaded, WCAG-AA Purdue palette. PR #47's contract docs landed with this task (consumer first). Verified with 131 frontend tests (recorded real-Gemini streams, mutation checks), stub and live UI checks in both themes and at phone width, code and architectural review subagents, and the deployed site.
<!-- SECTION:FINAL_SUMMARY:END -->
