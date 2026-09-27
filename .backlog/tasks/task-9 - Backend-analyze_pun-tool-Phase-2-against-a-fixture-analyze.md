---
id: TASK-9
title: 'Backend: analyze_pun tool (Phase 2) against a fixture /analyze'
status: Done
assignee:
  - '@yaisiel.torres'
created_date: '2026-09-17 23:34'
updated_date: '2026-09-27 20:27'
due_date: '2026-09-21'
labels: []
milestone: m-3
dependencies:
  - TASK-7
  - TASK-10
references:
  - docs/contracts.md
  - docs/project-spec.md
  - docs/engineering-practices.md
project: backend
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per docs/engineering-practices.md's Phase 2 plan: implement the analyze_pun tool definition and the tool_use -> tool-result round trip from docs/project-spec.md's architecture diagram. Calls Inference through an injectable client so it can run against a fixture matching docs/contracts.md's /analyze schema until Inference's real endpoint is live. Also defines the tool-call event shape within the /api/chat stream, which is sync point 3 in docs/project-spec.md and currently unspecified in docs/contracts.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Inference is called through an injectable client; tests substitute a fixture /analyze response instead of a live HTTP call
- [x] #2 The tool-call event shape (toolRequest/toolResponse chunks, toolCallId correlation rule) is implemented exactly as finalized in docs/contracts.md, closing sync point 3
- [x] #3 analyze_pun's tool request/response match the /analyze schema in docs/contracts.md exactly, with is_pun, confidence, pun_type and sense_source declared as nullable (Zod .nullable(), not .optional()), since Genkit validates tool output against the schema
- [x] #4 Non-2xx, malformed or timed-out Inference responses don't crash the chat flow: the tool returns docs/contracts.md's undetermined /analyze result (is_pun: null, with null pun_type/confidence/sense_source and no words), so Gemini judges the text itself; the test runs that object through the registered tool (not the bare client), and Backend logs which cause it was (timeout, non-2xx, malformed)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Decisions (agreed with @yaisiel.torres, 2026-09-27):
- Wire shape: mixed stream. Text chunks stay data: {"message": string}; a chunk carrying a toolRequest/toolResponse part is forwarded as Genkit's chunk.toJSON() ({role, index, content}).
- Injectable client = fetch itself. The tool owns URL, timeout (AbortSignal.timeout), res.ok and Zod validation; tests pass a fake fetch, production passes fixtureFetch until TASK-11 swaps in globalThis.fetch.
- AC #5: provisional INFERENCE_TIMEOUT_MS now, marked unmeasured in contracts.md; the measurement moves to a follow-up task depending on TASK-14. AC #5 stays unchecked here.
- Merge: hold the PR until TASK-10 is ready; TASK-10's branch builds on top of this one (deploy-backend.yml auto-deploys, and the Phase 1 frontend can't render tool chunks).

Steps:
1. backend/src/tools/analyze-pun.ts: analyzeResultSchema (nullable is_pun/pun_type/confidence/sense_source), UNDETERMINED_ANALYZE_RESULT, INFERENCE_TIMEOUT_MS, createAnalyzePunTool(ai, {fetch, inferenceUrl, timeoutMs}); logs cause (timeout, non_2xx, malformed, unreachable) and returns the undetermined result.
2. fixtureFetch answering /analyze with one canned homographic pun.
3. createChatFlow(ai, model, tools): pass tools to generateStream; streamSchema string | GenerateResponseChunk.
4. app.ts: wire the tool with fixtureFetch + config.inferenceUrl.
5. Tests: registered-tool tests per failure cause + success; undetermined result passes Genkit output validation; flow round trip with mockModel; wire-format parity with @genkit-ai/express for a tool turn.
6. contracts.md: exact mixed-stream shape, provisional timeout.
7. Backlog: follow-up task for cold-start measurement; note on TASK-11 (swap is fixtureFetch -> fetch).
8. Code review + architectural review subagents; docs drift check.

Revised after code + architectural review (decided with @yaisiel.torres, 2026-09-27):
- Parallel calls: Genkit returns parallel toolResponses in completion order, and Gemini rarely sets ref. Backend now numbers toolRequests with a per-reply model middleware (src/flows/tool-request-refs.ts); Genkit copies the ref onto the toolResponse, and the contract pairs by ref.
- Deploy order: consumer first. TASK-10 builds on main, accepts both string and object messages, and deploys before TASK-9 merges (TASK-9 now depends on TASK-10). Supersedes the 'branch TASK-10 on TASK-9' decision.
- Schema: analyzeResultSchema enforces contracts.md's cross-field rules (null-together, undetermined shape, sense_source iff is_pun true, llm_fallback has an empty explanation, confidence in [0,1]); a violation counts as malformed.
- Production fixture answers the undetermined result, not a canned pun; tests use tests/fixtures/analyze-results.ts.
- Doc drift fixed in a separate commit (project-spec, engineering-practices, frontend-design, local-setup, .env.example).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
From PR #28 review (2026-09-23): backend/src/routes/chat.ts's toUserFacingError maps errors to user-facing text by GenkitError.status only, so it doesn't recognize Genkit's UserFacingError (a GenkitError subclass, @genkit-ai/core/lib/error.js). If this task's tool code ever throws one, its intended message is replaced by the status-based text (usually 'Something went wrong'). Nothing throws one today. If you add one, pass it through in toUserFacingError using err.originalMessage (err.message is prefixed with the status, e.g. 'INVALID_ARGUMENT: ...'), and add a route test. AC #3 already prefers degrading to a well-formed result over failing the turn, so this should only matter for errors that really must end the turn.

Validation (2026-09-27): backend pnpm test 95/95, tsc --noEmit + pnpm build clean, biome check . clean.
- AC #1: createAnalyzePunTool takes fetch; tests pass fake fetches (tests/tools/analyze-pun.test.ts) and, for the flow, answeringWith(PUN_ANALYZE_RESULT) (tests/helpers/build-mock-chat-flow.ts). Three extra tests use the real fetch against a local http server to pin the timeout/unreachable classification.
- AC #2: chat.test.ts round-trip, parallel-calls and unique-refs tests; chat.wire-format.test.ts proves Hono bytes == @genkit-ai/express bytes for a tool turn.
- AC #3: mutation .nullable() -> .optional() on confidence fails 12/15 tool tests (Genkit's output validation rejects null, so the fallback would throw).
- AC #4: one test per cause (timeout before headers, timeout mid-body, unreachable, non_2xx, malformed x N incl. contract-rule violations), all run through the registered tool; logging.test.ts pins cause/status/errorCode as queryable fields through the real JSON sink.
- AC #5: open; moved to TASK-32 (provisional 20 s recorded in contracts.md).
- Reviews: code review + architectural review (subagents), then a third review of the ref middleware / schema rules. Fixed: result lost pre-tool text; parallel-call pairing (ref middleware); partial-piece refs; contract rules in schema; fixture now undetermined; doc drift.
- Before merge: TASK-10 must deploy first (TASK-9 depends on TASK-10), and one manual pnpm dev smoke test with real Gemini and a two-text prompt ('are these puns: X, Y?') should confirm Gemini accepts Backend-assigned function-call ids (can't be checked offline).

Smoke test (2026-09-27, pnpm dev + real Gemini via curl, 'Are these puns? 1) ... banker ... interest. 2) The meeting starts at noon.'): PASS. Gemini made two parallel analyze_pun calls in one model turn (both chunks index 0), each in its own chunk, and supplied its own ids (call_56935, call_56938). The middleware kept them, and the single tool chunk returned both toolResponses with the matching refs. Gemini judged both texts itself from the undetermined results; result held the full reply; no error event. thoughtSignature metadata was forwarded on the first toolRequest part. Consequence: Backend-assigned refs are a fallback, not the normal path, so the path where Gemini receives ids it didn't issue is still unexercised against real Gemini. Middleware comment and contracts.md corrected; contract now also says a turn's toolRequest parts can span several chunks.

AC #5 (Inference timeout set from a measured Cloud Run cold start, recorded in docs/contracts.md) moved to TASK-32 (2026-09-27, @yaisiel.torres), since it can't be measured until Inference is deployed (TASK-14). TASK-9 ships the named constant INFERENCE_TIMEOUT_MS with a provisional 20 s, marked unmeasured in contracts.md.

Stacked on PR #50 (TASK-10), 2026-09-27: merged #50's branch in, keeping #50's contracts.md, engineering-practices.md and TASK-10 backlog file, since #50 carries this PR's final contract text plus its additions; then dropped #50's 'Backend side pending PR #47' notes. If #50 is squash-merged, merge main in with -X ours (rehearsed: no conflicts, identical tree). Ref uniqueness (required by #50's contract): decided with @yaisiel.torres to detect and log rather than rename, since Gemini pairs calls with results by its own ids; numberToolRequests logs a WARNING when a reply reuses a ref.

Validation on main after merge (83f547c, #47; stacked on #50 = TASK-10), 2026-09-27: backend 99/99, frontend 131/131. PR review: the flow now passes Genkit's abortSignal to generateStream, so a user stop ends the tool loop instead of sending the remaining model turns to Gemini. Deploy order: both deploys ran from 83f547c; Firebase Hosting finished at 20:08:48Z, before the Cloud Run deploy started at 20:09:00Z. Deployed site: pun-agent.web.app shows the analyze_pun card with the undetermined result (fixtureFetch until TASK-11); the follow-up model turn hit Gemini's free-tier quota (RESOURCE_EXHAUSTED shown via TASK-24's error box).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Backend's analyze_pun tool (Phase 2): Gemini calls it with { text }, and it calls Inference's /analyze through an injected fetch. Production uses fixtureFetch, which answers the undetermined result until TASK-11. A timeout, unreachable Inference, a non-2xx or a malformed answer degrades to the undetermined result, logged with its cause, and the schema is nullable-typed with the contract's cross-field rules. /api/chat streams tool chunks as Genkit chunks next to plain-text messages, with every call ref'd (numbered when Gemini omits an id; reuse is logged) and the full reply text in result. The flow honours the user's stop. Closes sync point 3 (contract in docs/contracts.md, landed consumer-first with TASK-10). Verified with 99 backend tests, including a wire-format parity test against @genkit-ai/express, real-fetch timeout/unreachable tests and mutation checks, a real-Gemini smoke test, and the deployed site. The measured Inference timeout moved to TASK-32.
<!-- SECTION:FINAL_SUMMARY:END -->
