---
id: TASK-8
title: 'Frontend: live ChatModelAdapter for the Phase 1 Genkit stream'
status: Done
assignee:
  - '@yaitorr'
created_date: '2026-09-17 23:34'
updated_date: '2026-10-04 20:57'
due_date: '2026-09-21'
labels: []
milestone: m-2
dependencies:
  - TASK-6
  - TASK-7
  - TASK-13
references:
  - docs/design/frontend-design.md
project: frontend
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Genkit isn't one of assistant-ui's built-in framework adapters, so reaching any real Backend — not just the Phase 2 tool-calling one — requires a custom ChatModelAdapter that parses Genkit's stream events into assistant-ui message parts, per docs/design/frontend-design.md's 'Tool-call visibility' section. This is the Phase 1 version: text-only parsing, switched on via the live flag against the Backend Phase 1 proxy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ChatModelAdapter.run() parses Genkit's plain-text stream events into assistant-ui message parts and renders tokens incrementally, not just on stream completion
- [x] #2 VITE_CHAT_ADAPTER=live points the UI at the deployed Phase 1 Backend and a real conversation completes end-to-end on the Firebase-hosted app
- [x] #3 Adapter parsing logic is unit-tested against recorded fixture stream events, not a live stream, per docs/design/frontend-design.md's 'Development & testing' section
- [x] #4 Switching between stub and live leaves all Slice 1 UI (thread list, persistence, theme) unchanged
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Record a real Phase 1 /api/chat stream (success, with multi-byte chars) and a real error-event stream (invalid API key) from the local backend as raw fixtures.
2. genkit-flow-stream.ts: parseGenkitFlowStream(body) async generator. Frames events on the \n\n delimiter with a carry-over buffer, decodes via TextDecoder with {stream:true} (TextDecoderStream hits a TS DOM-lib BufferSource/Uint8Array variance error in pipeThrough; the flag is equivalent), throws on error: events and on a body that ends before result (truncation), cancels the body in finally on any early exit. Hand-rolled rather than genkit/beta/client: that client sends {data: input} (contract says {messages}), decodes without stream:true (garbles split UTF-8), and never checks reader done (infinite loop on truncated streams) -- both reproduced against 1.42.0.
3. live-chat-model-adapter.ts: createLiveChatModelAdapter(chatUrl) -- maps ThreadMessage[] to {messages:[{role,content}]} via a shared getMessageText helper (also reused by the stub), POSTs with the run's abortSignal, throws on non-2xx, yields the running total of message deltas (assistant-ui replaces content per yield), final yield uses result's text.
4. Tests first against the recorded fixtures: every-byte-offset split, one byte per read, error event, truncation (before result and mid-event), unrecognized event, body cancelled on early exit, contract request shape incl. abortSignal pass-through, cumulative + incremental yields, non-2xx; getChatModelAdapter live-branch URL building and missing VITE_BACKEND_URL. Mutation-checked: reintroducing each bug fails the matching tests.
5. get-chat-model-adapter.ts: live -> createLiveChatModelAdapter(new URL('/api/chat', VITE_BACKEND_URL)); required when live. vite-env.d.ts + .env.example updated.
6. Verify AC#4 + rendered output: App tests pass unchanged; Playwright drove the live UI against local backend + real Gemini.
7. AC#2 blocked on TASK-13 (backend not on Cloud Run yet); deploy-frontend.yml untouched until then.
8. Code review subagent; docs drift follow-up commit (local-setup.md:88, frontend-design.md).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented parser + live adapter test-first against real recorded streams. Rendered verification (Playwright, live mode, local backend, real Gemini): 19 distinct on-screen snapshots growing 29->1085 chars (incremental, AC#1), markdown + accents render correctly, thread list/theme unchanged; a real Gemini 503 mid-stream error rendered in assistant-ui's error box. Code review (high) findings: fixed body not cancelled on early exit (+test), added getChatModelAdapter live-branch tests, synced plan. Refuted empirically: 'empty assistant turn after a failed reply breaks later turns' -- Gemini accepted {role:assistant, content:''} via the real backend. Not acted on: payload shape guards in parseEvent (backend error shape is pinned by its express parity test), path-preserving URL join (Cloud Run URLs have no path; contract path is root /api/chat), O(n^2) buffer re-scan (KB-sized events). Follow-up idea: backend forwards Gemini's raw developer-facing error text to users. 35/35 frontend tests, tsc, biome clean. DoD#2 architectural review judged N/A: no contract/topology/dependency change (the Genkit-client option that would have changed the contract was rejected).

Pairing follow-ups: added an adapter test for an error event arriving after message chunks (partial text is yielded before the throw; assistant-ui's local runtime then marks the message incomplete/error and keeps that content), and renamed the 200-then-error test so 'mid-stream' isn't misread as 'after some text'. 36/36 frontend tests, tsc, biome clean. AC #1/#3/#4 checked on the evidence above; AC #2 stays open until TASK-13 deploys the backend. DoD #2 checked as not applicable: no contracts.md, topology, isolation/phase-order, dependency, service, or deploy-target change.

Docs drift fixed in a separate follow-up commit: local-setup.md (live mode + VITE_BACKEND_URL + CORS origin note replace the 'placeholder that throws' text), frontend-design.md (env flag now documented, parsing tests use recorded streams, fixture-sharing confirmed for Phase 1, CORS open item marked resolved by TASK-7). README.md, project-spec.md, AGENTS.md checked: no drift.

AC #2 work (2026-09-24): deploy-frontend.yml builds with VITE_CHAT_ADAPTER=live and VITE_BACKEND_URL=https://pun-agent-backend-203365930808.us-east1.run.app as step env, not frontend/.env.production (chosen with @yaisiel.torres: keeps local builds and CI tests on the stub and off Gemini quota). The workflow file joined its own paths filter, since its build env is part of the frontend build. A post-build grep fails the deploy if the URL isn't in the bundle (an unset flag silently builds the stub; checked against both a live and a stub build). Backend CORS defaults gained https://pun-agent.firebaseapp.com (Firebase's second domain; it would have broken once the site went live), test-first. Pre-merge check: the same live bundle, served by vite preview on :5173 (an allowlisted origin), got a real Gemini reply from Cloud Run, rendered correctly. Reviews: code review found no blockers; architectural review flagged that the deployed Phase 1 adapter couples backend deploys to the /api/chat stream shape (engineering-practices.md now says so; TASK-9 should get a matching AC once PR #31, which rewrites TASK-9's ACs, merges), and that the live UI widens TASK-25's exposure (noted there). Pre-existing frontend CI gaps moved to their own task. Still open: AC #2 needs a real conversation on pun-agent.web.app after this merges and deploys.

Correction (2026-09-24): the deploy-order coupling is recorded in TASK-10's notes as an accepted risk (TASK-9 and TASK-10 expected back to back), not as a TASK-9 criterion or an engineering-practices.md exception; the sentence added to engineering-practices.md was removed.

AC #2 verified (2026-09-26) after #37 and #38 (App Check) reached main in one push (9d17fea had no runs of its own; run 36245664862 at 50e089c deployed both). In the browser on https://pun-agent.web.app, a real conversation completed: the reply streamed from POST https://pun-agent-backend-203365930808.us-east1.run.app/api/chat (200, per the page's performance entries), with reCAPTCHA Enterprise App Check attestation loaded, and markdown rendered correctly. On https://pun-agent.firebaseapp.com, CORS and App Check passed (200). The first reply hit a Gemini free-tier 503 'high demand' (confirmed in Cloud Run logs) and showed TASK-23's 'The assistant is busy right now' message; the retry streamed a full reply that rendered correctly. The backend logs also showed tokenless curl POSTs to /api/chat rejected with 401 (App Check enforced).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Live ChatModelAdapter for the Phase 1 Genkit stream: a hand-rolled SSE parser (UTF-8-safe framing, error/truncation handling, body cancellation) and an adapter yielding cumulative text, unit-tested against recorded real streams. The deployed Firebase site builds with VITE_CHAT_ADAPTER=live against Cloud Run (step env in deploy-frontend.yml, bundle guard), and the backend CORS allows both Firebase domains. Verified with 36 adapter/app tests, a pre-merge local run of the live bundle, and real conversations on both pun-agent.web.app and pun-agent.firebaseapp.com after deploy.
<!-- SECTION:FINAL_SUMMARY:END -->
