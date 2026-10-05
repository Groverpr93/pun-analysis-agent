---
id: TASK-6.2
title: Thread list and per-thread history via localStorage adapters
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
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implements the RemoteThreadListAdapter and ThreadHistoryAdapter described in docs/design/frontend-design.md's 'Thread list' section, entirely localStorage-backed with no server persistence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 RemoteThreadListAdapter supports list, create, rename, archive, and delete against localStorage
- [x] #2 A thread is only written to the stored list once its first message is sent (guarded via initialize()), so an empty 'New Chat' never accumulates on reload
- [x] #3 Sessions always start on a fresh thread on load; no prior thread is auto-resumed
- [x] #4 Both adapters are unit-tested against a fake/in-memory localStorage per docs/design/frontend-design.md's 'Development & testing' section
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verified assistant-ui (0.3.20 core, bundled by @assistant-ui/react 0.15.21) ships a built-in `createLocalStorageAdapter(options: { storage: AsyncStorageLike; prefix?: string })` (from `@assistant-ui/core/react`) that already returns a full `RemoteThreadListAdapter` (list/initialize/rename/archive/unarchive/delete/fetch/generateTitle) plus, via `unstable_Provider`/`unstable_useAdapters`, a matching `ThreadHistoryAdapter` for per-thread message persistence -- both localStorage-shaped already, and `initialize()` only writes a thread into the stored list the first time it's called (which the history adapter's `append()` triggers on first message), satisfying AC#2's guard for free.
2. Rather than hand-roll both adapters from scratch (duplicating this logic, per AGENTS.md's DRY guidance), add `@assistant-ui/core` as an explicit frontend dependency (pinned to the version @assistant-ui/react resolves, 0.3.20) and write a thin `src/lib/thread-list/local-storage-thread-list-adapter.ts` that wraps `window.localStorage` (sync) into the `AsyncStorageLike` (async get/set/removeItem) shape the factory expects, with a `pun-agent:` key prefix.
3. Wire it into `App.tsx` via `useRemoteThreadListRuntime({ adapter, runtimeHook: () => useLocalRuntime(chatModelAdapter) })` with no `threadId`/`initialThreadId` passed, so every load starts on a fresh, uncontrolled thread (AC#3) -- prior threads stay reachable only via the sidebar list.
4. Unit tests: `local-storage-thread-list-adapter.test.ts` against a hand-written in-memory fake `AsyncStorageLike` (not jsdom's real localStorage, to satisfy AC#4's "fake/in-memory" requirement directly) covering list/rename/archive/delete and, specifically, that a thread is absent from `list()` until `initialize()` is called once (never accumulates from mere construction).
5. Component-level coverage in App.test.tsx (jsdom's real localStorage, cleared per test): a thread only appears in the sidebar after the first message is sent, and a previously-stored thread is never auto-resumed on a fresh render.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Wrapped assistant-ui's built-in createLocalStorageAdapter (from @assistant-ui/core/react, added as an explicit pinned dependency at 0.3.20 -- the exact version @assistant-ui/react 0.15.21 already resolves) instead of hand-rolling a RemoteThreadListAdapter/ThreadHistoryAdapter pair; it already implements list/initialize/rename/archive/unarchive/delete/fetch and a matching per-thread history adapter, all localStorage-shaped, with initialize() only persisting a thread on first call. src/lib/thread-list/local-storage-thread-list-adapter.ts wraps window.localStorage into the AsyncStorageLike shape it expects ("pun-agent:" key prefix). Unit tests (7, against a hand-written in-memory fake, not jsdom's real localStorage) cover list/initialize-guard/rename/archive/unarchive/delete plus cross-instance persistence. App.tsx passes no threadId/initialThreadId to useRemoteThreadListRuntime, so sessions always start fresh. Verified live: repeatedly clicking "New Thread" without sending a message never adds sidebar entries (0 after 3 clicks); sending a message adds exactly one; a component test confirms a pre-seeded prior thread is listed but not auto-resumed as the active view.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Wrapped assistant-ui's built-in createLocalStorageAdapter with a window.localStorage-backed AsyncStorageLike, rather than hand-rolling a RemoteThreadListAdapter/ThreadHistoryAdapter pair (DRY). Verified with 7 unit tests against a hand-written in-memory fake storage (list/initialize-guard/rename/archive/unarchive/delete/cross-instance persistence) plus 2 App.test.tsx component tests (no sidebar accumulation until first message; a pre-seeded prior thread is listed but never auto-resumed as the active view). Also verified live: 3x 'New Thread' clicks with no message sent left 0 sidebar entries; sending a message added exactly 1.
<!-- SECTION:FINAL_SUMMARY:END -->
