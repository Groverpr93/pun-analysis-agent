---
id: TASK-7
title: 'Backend: Phase 1 Gemini proxy for /api/chat, plus CORS'
status: Done
assignee:
  - '@yaitorr'
created_date: '2026-09-17 23:34'
updated_date: '2026-10-04 20:57'
due_date: '2026-09-21'
labels: []
milestone: m-2
dependencies: []
references:
  - docs/contracts.md
  - docs/engineering-practices.md
  - docs/local-setup.md
project: backend
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per docs/engineering-practices.md's Phase 1 plan: /api/chat should forward the conversation straight to Gemini via Genkit's Google AI plugin and stream the reply back, with no analyze_pun tool yet. CORS middleware is required from this point on since Frontend (Firebase Hosting) and Backend (Cloud Run) are always cross-origin, in local dev per docs/local-setup.md's ports and in the deployed pairing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 POST /api/chat accepts {messages: [{role, content}]} per docs/contracts.md and streams Gemini's reply back in Genkit flow stream format
- [x] #2 CORS middleware (e.g. hono/cors) is enabled so a browser-origin request from the Firebase-hosted frontend succeeds, both in local dev and against the deployed Cloud Run URL
- [x] #3 No tool-calling logic exists yet — Gemini responds as a plain conversational proxy
- [x] #4 Backend tests cover this flow using a Genkit test double for the model call, not a live Gemini request, per docs/engineering-practices.md's 'Backend in isolation' section
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Install genkit + @genkit-ai/google-genai (non-deprecated replacement for @genkit-ai/googleai) at matched versions 1.42.0.
2. src/genkit.ts: production Genkit instance with googleAI() plugin (reads GEMINI_API_KEY from env automatically), default model googleAI.model('gemini-flash-latest').
3. src/flows/chat.ts: chatInputSchema (zod, matches contracts.md's {messages:[{role,content}]}), role mapper (assistant -> Genkit's 'model' role), createChatFlow(ai, model) factory for DI so tests can substitute a fake model.
4. src/routes/chat.ts: createChatHandler(flow) Hono handler, hand-rolling Genkit's actual flow-stream wire format (data: {message}\n\n chunks, data: {result}\n\n final) via hono/streaming's stream() helper -- verified this format by reading @genkit-ai/express's real source (not a dependency, Hono project) rather than guessing.
5. app.ts: wire the real /api/chat route + hono/cors (origin allowlist: localhost:5173 dev, https://pun-agent.web.app deployed).
6. Tests: use genkit/testing's mockModel (Genkit's own test-double harness per engineering-practices.md) against a throwaway genkit({}) instance with no googleAI plugin, so pnpm test needs no API key/network.
7. backend/.env.example documenting GEMINI_API_KEY; package.json dev script uses tsx --env-file=.env.local (Node 22 native, no dotenv dependency).
8. Code review + architectural review (new dependency: genkit) via subagents before finalizing.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: src/genkit.ts (ai instance + googleAI() plugin, using @genkit-ai/google-genai not the deprecated @genkit-ai/googleai), src/flows/chat.ts (createChatFlow DI factory, role mapping), src/routes/chat.ts (Hono handler hand-replicating Genkit's real flow-stream wire format, verified against @genkit-ai/express source), app.ts (hono/cors + route wiring), config.ts (allowedOrigins), backend/.env.example, package.json (--env-file-if-exists for dev; fixed test glob to tests/*.test.ts tests/**/*.test.ts since plain sh lacks globstar and was silently dropping tests/app.test.ts once nested test dirs were added). Tests: genkit/testing's mockModel against a plugin-less genkit({}) instance, registered once per file per mockModel's own reset()/respondWith() idiom. 10/10 tests pass under plain sh (simulating CI). Smoke-tested against real Gemini with the user's key: confirmed exact expected wire format end-to-end; transient 503s seen are Gemini free-tier 'gemini-flash-latest' overload, not our code (also exercised the error-chunk path). Typecheck and biome clean. Next: code review + architectural review (new dependency) before finalizing.

Post-review fixes (from code-review + architectural-review subagents, both run before this task was considered done, per AGENTS.md): (1) pnpm-workspace.yaml had literal placeholder text ('set this to true or false') in allowBuilds for @firebase/util and protobufjs, silently written by pnpm during earlier installs -- resolved both to false (neither's postinstall script is needed for our usage) and confirmed pnpm install is clean. (2) config.ts's CORS_ORIGIN parsing didn't trim/filter, so a stray space after a comma or a trailing comma silently broke origin matching; fixed, and an empty-string CORS_ORIGIN now correctly falls back to defaults instead of blocking every origin. (3) package.json's test glob (tests/*.test.ts tests/**/*.test.ts) double-matched tests/app.test.ts under shells where ** recurses by default (zsh, bash+globstar), double-running its tests -- replaced with a single quoted 'tests/**/*.test.ts' so Node's own test-runner glob engine (not the shell) does the recursive matching, verified identical (10 tests, no dupes) under sh/bash/zsh. (4) routes/chat.ts's error-path JSON now uses genkit/context's real getCallableJSON(e) instead of a hand-rolled {message} shape -- matches Genkit's actual wire format and, as a side benefit, stops leaking arbitrary internal error messages for non-GenkitError failures (genericizes to 'Internal Error'). (5) Added tests/routes/chat.wire-format.test.ts: a golden/parity test that runs the real @genkit-ai/express handler (added as a devDependency only, not a runtime one) against the identical mock flow and asserts byte-identical streamed output to our hand-rolled Hono handler, for both the success and error paths -- closes the 'hand-replicated format could silently drift on a Genkit upgrade' gap the architectural review flagged, without pulling Express into the runtime. (6) Added a CORS preflight test against the real app for POST /api/chat (never invokes the flow, so no live Gemini call) since the deleted 501 stub test had been the only coverage touching the real app's /api/chat wiring. (7) Deduplicated the mockModel/chatFlow test bootstrap (now used in 3 files) into tests/helpers/build-mock-chat-flow.ts. (8) toGenkitRole's nested ternary replaced with a Record lookup for readability. Findings NOT acted on, with reasoning: eager module-level googleAI() plugin construction (verified genuinely lazy -- no network/key needed until a request actually runs; architectural-review confirmed pnpm test passes with zero env vars set) -- adding lazy-init indirection here would be speculative. Permissive role-string fallback to 'user' -- intentional and already documented in code comment, matches assistant-ui's actual fixed role set. All 13 backend tests pass (up from 3 originally), typecheck clean, biome clean across the whole repo, and manually smoke-tested end-to-end against live Gemini (including the 503-error path, which now shows the correct structured {status,message,details} shape).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented the Phase 1 Genkit chat proxy: src/genkit.ts (Genkit instance + @genkit-ai/google-genai's googleAI() plugin -- @genkit-ai/googleai is npm-deprecated, so used the current replacement instead), src/flows/chat.ts (createChatFlow DI factory matching contracts.md's {messages:[{role,content}]} shape, mapping 'assistant'->Genkit's 'model' role), src/routes/chat.ts (Hono handler streaming in Genkit's real flow-stream wire format), app.ts (hono/cors + route wiring), config.ts (CORS_ORIGIN parsing). Verified with: 13 backend tests (up from 3) including Genkit's own mockModel test double per engineering-practices.md's isolation rule (zero env vars/network needed, confirmed by architectural review), a golden/parity test asserting our hand-rolled wire format is byte-identical to the real @genkit-ai/express handler's output for both success and error paths, and a CORS preflight test against the real app. Also manually smoke-tested end-to-end against live Gemini with the user's own API key (including the 503-overload error path). A code-review skill pass (8 finder angles) and a separate architectural-review subagent (new dependency: genkit) both ran before finalizing, per AGENTS.md; real findings were fixed (pnpm-workspace.yaml placeholder allowBuilds values, CORS_ORIGIN trim/empty-string handling, a test-glob double-match bug under zsh/globstar shells, error-payload shape now uses Genkit's real getCallableJSON), and the rest were judged intentional/already covered (documented in task notes). Typecheck and biome clean repo-wide.
<!-- SECTION:FINAL_SUMMARY:END -->
