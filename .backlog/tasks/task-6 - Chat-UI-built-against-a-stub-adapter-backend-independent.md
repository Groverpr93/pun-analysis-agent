---
id: TASK-6
title: Chat UI built against a stub adapter (backend-independent)
status: Done
assignee:
  - '@yaitorr'
created_date: '2026-09-17 23:33'
updated_date: '2026-10-04 20:57'
due_date: '2026-09-21'
labels: []
milestone: m-1
dependencies:
  - TASK-5
project: frontend
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per docs/design/frontend-design.md and docs/engineering-practices.md's isolation rule, Frontend must be fully buildable and demoable with no Backend running. This is the full chat experience — greeting/chat transition, composer, thread list, persistence — built entirely against a StubChatModelAdapter, deployable via Slice 0's pipeline and demoable before any real Backend exists.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The full chat UI (greeting, composer, streaming render off the stub, thread list) is live on Firebase Hosting via the Slice 0 pipeline
- [x] #2 The deployed app is fully usable end-to-end with zero real Backend, Inference, or Gemini quota involved
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Executed as three subtasks, in dependency order 6.3 -> 6.2 -> 6.1 (each has its own detailed plan/notes/AC verification):
1. TASK-6.3: StubChatModelAdapter + Phase 1/Phase 2 fixtures + VITE_CHAT_ADAPTER flag.
2. TASK-6.2: localStorage-backed RemoteThreadListAdapter/ThreadHistoryAdapter (wrapping assistant-ui's built-in createLocalStorageAdapter rather than a hand-rolled one).
3. TASK-6.1: assistant-ui's pre-styled Thread + ThreadListSidebar (via shadcn/Tailwind v4 registry), retheme toward the Claude-inspired/Purdue-gold palette, greeting<->chat shell, header.
4. Wire everything into App.tsx, replace the Vite starter test with real component tests, run lint/build/test, then verify AC#1/#2 by confirming the Slice 0 CI pipeline deploys this build to Firebase Hosting with zero backend calls.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
PR #17 merged to main as d4be3c4; deploy-frontend.yml run 35508284555 succeeded. Required an unplanned mid-PR fix: an install during implementation had re-resolved an unrelated transitive dep (systeminformation, via @dotenvx/dotenvx) to a build published hours before CI ran, tripping pnpm's minimumReleaseAge supply-chain policy on CI's clean runner (it passed locally only because the package was already warm in the local store, which skips that check). Pinned via a pnpm-workspace.yaml override to an older, policy-compliant version -- and had to relocate it there (not package.json's pnpm.overrides) after main concurrently bumped packageManager to pnpm@12.5.1, which stopped reading pnpm.* keys from package.json. Verified against a genuinely empty pnpm store under pnpm 12.5.1 itself, not just the local warm one.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Verified live at https://pun-agent.web.app via a Playwright-driven check: greeting state renders, sending a message streams the stub's plain-text and tool-call fixtures correctly, thread list updates, and zero non-hosting network requests occur (no real Backend/Inference/Gemini call) -- confirming both parent acceptance criteria. All three subtasks (6.1/6.2/6.3) were already Done with their own verification evidence.
<!-- SECTION:FINAL_SUMMARY:END -->
