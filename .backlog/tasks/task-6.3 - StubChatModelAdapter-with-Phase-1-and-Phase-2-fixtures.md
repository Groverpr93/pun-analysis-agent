---
id: TASK-6.3
title: StubChatModelAdapter with Phase 1 and Phase 2 fixtures
status: Done
assignee:
  - '@yaitorr'
created_date: '2026-09-17 23:33'
updated_date: '2026-10-04 20:57'
due_date: '2026-09-21'
labels: []
milestone: m-1
dependencies: []
references:
  - docs/design/frontend-design.md
parent_task_id: TASK-6
project: frontend
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The seam that lets Frontend build/test without a live Backend, per docs/engineering-practices.md's isolation rule and docs/design/frontend-design.md's 'Development & testing' section. CI and unit tests always use this stub.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 StubChatModelAdapter implements the same run() interface as the real ChatModelAdapter and returns canned streamed responses
- [x] #2 At least two fixtures exist: a plain-text-only stream (Phase 1 shape) and a text-plus-tool-call stream (Phase 2 shape)
- [x] #3 A build-time env flag (e.g. VITE_CHAT_ADAPTER=stub|live) selects the stub in local dev and CI by default
- [x] #4 Component tests (greeting-to-chat transition, message rendering, loading/error states) run against the stub in CI with no network access
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add Tailwind v4 + shadcn (base UI, nova preset) + assistant-ui's `@assistant-ui/thread` and `@assistant-ui/threadlist-sidebar` registry elements to frontend/ (done via `npx shadcn add`) — this pulls in `@assistant-ui/react` (0.15.x) as the real ChatModelAdapter/runtime surface the stub must match.
2. Implement `src/lib/chat/stub-chat-model-adapter.ts`: a `ChatModelAdapter` (verified real type from node_modules: `run(options): Promise<ChatModelRunResult> | AsyncGenerator<ChatModelRunResult>`, `content: ThreadAssistantMessagePart[]`) whose `run` is an async generator that replays a scripted fixture with small delays (simulated streaming), yielding cumulative state each step per the adapter contract, and aborts cleanly on `abortSignal`.
3. Fixtures in `src/lib/chat/fixtures/`: `phase1-text.ts` (plain incremental text parts only) and `phase2-tool-call.ts` (text + a `tool-call` part shaped like contracts.md's analyze_pun output, progressing running -> complete). Adapter picks the fixture based on simple content of the last user message (keyword-triggered) so both fixtures are reachable through the real UI without extra plumbing; also add a lightweight error-triggering path for the "error state" component tests.
4. `src/lib/chat/get-chat-model-adapter.ts`: reads `import.meta.env.VITE_CHAT_ADAPTER` (`stub` default/unset, `live` throws a clear "not implemented until TASK-8" error, anything else throws).
5. Unit tests: `stub-chat-model-adapter.test.ts` asserting both fixtures stream to completion with the right part shapes and that abort stops the generator.
6. Component tests (in App.test.tsx, shared with TASK-6.1/6.2 since they exercise the same rendered app): greeting -> chat transition, assistant text rendering, tool-call rendering, loading indicator, error state — all against the stub, no network.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented createStubChatModelAdapter (src/lib/chat/stub-chat-model-adapter.ts) as an async-generator ChatModelAdapter matching the real run() contract verified from node_modules types. Two fixtures: phase1-text.ts (plain incremental text) and phase2-tool-call.ts (text -> running tool-call -> completed tool-call with an /analyze-shaped result -> follow-up text). Adapter picks a fixture by keyword in the last user message ("pun" -> tool-call fixture, "error" -> simulated failure, else plain text) so both shapes and the error path are reachable through the real UI and testable end-to-end, not just unit-tested in isolation. get-chat-model-adapter.ts reads VITE_CHAT_ADAPTER (stub default/unset; live throws a clear "not implemented until TASK-8" error). Unit tests (4) cover both fixture shapes, error throw, and abort handling. Verified live via a Playwright-driven dev server run (not just unit tests): greeting, plain-text streaming, tool-call rendering, and the error banner all render correctly.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented createStubChatModelAdapter matching the real ChatModelAdapter run() contract, with Phase 1 (text-only) and Phase 2 (text+tool-call) fixtures, plus VITE_CHAT_ADAPTER=stub|live (stub default). Verified via 4 unit tests (both fixture shapes, error throw, abort) and 7 App.test.tsx component tests (greeting->chat transition, text rendering, loading indicator, tool-call rendering, error state) — all 18 frontend tests pass in CI's no-network environment. Also verified live against a running dev server via Playwright (screenshots + console-error check).
<!-- SECTION:FINAL_SUMMARY:END -->
