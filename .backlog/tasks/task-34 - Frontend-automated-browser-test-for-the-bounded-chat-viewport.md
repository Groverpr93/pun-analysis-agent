---
id: TASK-34
title: 'Frontend: automated browser test for the bounded chat viewport'
status: To Do
assignee:
  - '@yaitorr'
created_date: '2026-09-27 18:43'
updated_date: '2026-10-04 20:57'
labels:
  - frontend
  - testing
dependencies:
  - TASK-33
references:
  - docs/design/frontend-design.md
  - frontend/src/App.tsx
priority: low
type: task
project: frontend
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-33 fixed a layout bug where the chat thread viewport grew without bound after two exchanges. assistant-ui sizes the last turn's scroll reserve from the viewport height, so an unbounded viewport feeds back into itself. The bug only shows up with real layout. jsdom (the current Vitest environment) computes no heights, so TASK-33 shipped a documented manual check in docs/design/frontend-design.md instead of an automated one.

An automated guard needs a real browser, e.g. Vitest browser mode with the Playwright provider. That adds devDependencies and a Chromium download to CI (test.yml / deploy-frontend.yml), so it needs a cost decision and, per AGENTS.md, an architectural review for the new dependency. A throwaway CDP script used during TASK-33 showed the check itself is simple: send 2+ messages with the stub adapter, then compare the viewport height with innerHeight minus the header.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An automated test renders the app with the stub adapter, completes at least three exchanges, and asserts the thread viewport height stays equal to the space below the header and `document.body.scrollHeight` equals `window.innerHeight`
- [ ] #2 The test fails when the `h-dvh` bound or the `flex-1 overflow-hidden` wrapper in App.tsx is removed
- [ ] #3 CI runs it on every PR, with the added CI time and Chromium download documented and accepted
- [ ] #4 The manual layout check in frontend-design.md is removed or updated to point at the automated test
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->
