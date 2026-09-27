---
id: TASK-33
title: 'Frontend: chat thread viewport grows without bound after two exchanges'
status: Done
assignee:
  - '@yaisiel.torres'
created_date: '2026-09-27 18:32'
updated_date: '2026-09-27 18:48'
labels:
  - frontend
  - bug
dependencies: []
references:
  - frontend/src/App.tsx
  - frontend/src/components/assistant-ui/elements/thread.aui.tsx
type: bug
project: frontend
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Once a thread has two or more exchanges, the chat viewport (`[data-slot=aui_thread-viewport]`) keeps growing — from ~768px to 40,000+px and climbing — and `document.body.scrollHeight` grows with it. The message list can scroll out of sight, so the thread pane looks blank. Reproduced on main (62fe060) with the stub adapter in the Claude desktop app browser pane (innerHeight 768) by sending "hello there", waiting for the reply, then sending "hello again".

Suspected cause: assistant-ui sizes the last turn's reserve space from the viewport's height (`turnAnchor="top"`), and if the viewport is not height-bounded by its ancestors (SidebarProvider/SidebarInset in App.tsx, ThreadRoot in thread.aui.tsx), growing the reserve grows the viewport, which grows the reserve again.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 With the stub adapter, the thread viewport height stays equal to the space below the header across at least four exchanges (no growth between repeated measurements)
- [x] #2 The chat scrolls inside the thread viewport, not the page: `document.body.scrollHeight` stays equal to `window.innerHeight`
- [x] #3 After sending a message, the new user message is scrolled to the top of the viewport and the assistant reply is visible below it (the pane never looks blank)
- [x] #4 Behavior is checked in the desktop app browser pane and at least one regular browser (Chrome or Safari)
- [x] #5 A regression check exists: an automated test that would fail on the unbounded layout, or a documented manual check if an automated one is not practical
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce on main with the stub adapter and measure which element grows and by how much per frame.
2. Read assistant-ui 0.15.21 top-anchor reserve code to confirm the feedback loop.
3. Bound the thread height in App.tsx following assistant-ui's default template (h-dvh shell + flex-1 overflow-hidden wrapper around Thread); leave the registry-owned thread.aui.tsx unchanged.
4. Verify in the desktop browser pane (1280x768 and mobile 375x812) and in real Google Chrome via CDP across 4 exchanges.
5. Regression check (agreed with user): documented manual check in docs/design/frontend-design.md now; automated browser test tracked separately as TASK-34.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause (measured): assistant-ui (turnAnchor="top") inserts a [data-aui-top-anchor-reserve] spacer after the streaming assistant message sized as reserve = anchorTop + viewport.clientHeight - (viewport.scrollHeight - reserve) (computeTopAnchorSlack.js), recomputed on every ResizeObserver tick of the viewport. SidebarProvider's wrapper only has min-h-svh, so every ancestor of the viewport is height:auto and the viewport is as tall as its content: clientHeight == scrollHeight, so reserve_next = reserve + anchorTop. Measured growth was exactly 220px/frame = the second user message's offset. The first turn in a fresh thread never creates a reserve in our setup (observed via MutationObserver), which is why it takes two exchanges.
Fix: SidebarProvider className="h-dvh" plus a flex-1 overflow-hidden wrapper around <Thread/>, matching assistant-ui templates/default/app/assistant.tsx (their thread-list-sidebar docs snippet omits this and is what we had copied).
Verified: browser pane 1280x768: viewport stays 712px (768-56 header), body 768, across 4 exchanges; reserve converges (334px) and scrollTop pins each new message (220, 424, 628). Mobile 375x812: viewport 756, body 812. Google Chrome 153 headless via CDP: main grows to 520,522px after 4 exchanges; fix holds at 712px. Safari not automated (would require enabling Safari remote automation). lint/test/build green.

Code review (subagent): no defects. Acted on: App.tsx comment now states overflow-hidden is load-bearing; doc check names VITE_CHAT_ADAPTER unset and assistant-ui bumps as a trigger. Verified the load-bearing claim: with h-dvh kept but overflow-hidden removed live, the viewport grew 1582 -> 1802px in 1s after the second exchange. Empty/greeting state screenshotted at 1280x768 on main and on the fix: identical (min-h-svh already filled one screen while empty). Documented console check run verbatim: [712, 768, 768] stable. Architectural review not needed: no contract, topology, isolation/phase or dependency change. Re-ran lint + 76 tests: green.

Docs drift check after 9009ada: README.md, docs/project-spec.md, docs/local-setup.md and AGENTS.md do not describe the app-shell layout, and no script/command/CI step changed; no follow-up commit needed. Safari not checked (automating it requires enabling Safari remote automation); left for a human spot check.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the chat thread viewport growing without bound after two exchanges. Root cause: assistant-ui's turnAnchor="top" reserve is sized from viewport.clientHeight, and our app shell (SidebarProvider min-h-svh only) left the viewport height:auto, so each reserve resize grew the viewport by the anchor offset per frame. App.tsx now sizes the shell with h-dvh and wraps Thread in flex-1 overflow-hidden, as assistant-ui's default template does; thread.aui.tsx is untouched. Verified in the desktop browser pane (1280x768, 375x812) and headless Google Chrome 153 via CDP over 4 exchanges: viewport stays innerHeight minus the header, body.scrollHeight == innerHeight, and each new message is pinned to the top (main grew to 520k px in the same run). A manual layout regression check lives in docs/design/frontend-design.md; TASK-34 tracks an automated browser test. lint, 76 tests and build green.
<!-- SECTION:FINAL_SUMMARY:END -->
