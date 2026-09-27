---
id: TASK-31.2
title: 'Frontend: thinking-otter loading animation with rotating phrases'
status: To Do
assignee: []
created_date: '2026-09-27 15:02'
labels: []
milestone: m-5
dependencies: []
references:
  - frontend/src/components/assistant-ui/elements/thread.aui.tsx
  - frontend/src/components/icons/otter-mark.tsx
parent_task_id: TASK-31
type: feature
project: frontend
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
While a reply is pending, the thread shows assistant-ui's indicator part as a generic pulsing dot (thread.aui.tsx, the "indicator" case), which says nothing about the otter mascot (TASK-22). Replace it with an animated Otto thinking, plus a line of playful text that keeps changing, similar to how coding agents cycle status verbs. The indicator only shows until the first streamed token, often under a second with gemini-flash but longer when analyze_pun calls Inference, so the text must be visible right away rather than only after the first rotation. Seed phrase list (user-provided plus on-brand additions): pun-ishing..., bibbidi-bobbidi-booping..., 42..., turning water into tokens..., optimizing the paperclip factory..., phoning home..., rick-rolling..., otter-thinking it..., cracking the shell..., sniffing out the pun..., floating on it..., double-checking the double meaning....
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The pulsing-dot indicator is replaced by an animated thinking-otter sprite derived from the existing OtterMark design, authored as inline SVG/CSS with no raster assets and no new runtime dependency
- [ ] #2 A phrase appears as soon as the indicator mounts, starting at a random entry, then changes on a fixed interval without repeating the same phrase twice in a row
- [ ] #3 Phrases live in a single frontend constant seeded with the list in this task's description, so adding one is a one-line change
- [ ] #4 Screen readers get one stable status label (e.g. "Otto is thinking") rather than every rotating phrase; the playful text is hidden from assistive tech
- [ ] #5 Under prefers-reduced-motion the sprite does not animate (matching the existing motion-reduce:animate-none usage in thread.aui.tsx)
- [ ] #6 The rotation timer is cleared on unmount (reply starts streaming, user stops, or navigates away), with no leaked intervals
- [ ] #7 Frontend tests cover immediate first phrase, rotation (fake timers), no immediate repeats, the stable accessible label, and cleanup; pnpm --dir frontend lint and test pass
- [ ] #8 Rendered output is checked in the browser in light and dark themes and at phone width
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->
