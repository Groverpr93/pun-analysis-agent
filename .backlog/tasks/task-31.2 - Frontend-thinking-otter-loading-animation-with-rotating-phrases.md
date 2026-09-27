---
id: TASK-31.2
title: 'Frontend: thinking-otter loading animation with rotating phrases'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-27 15:02'
updated_date: '2026-09-27 15:51'
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
- [x] #1 The pulsing-dot indicator is replaced by an animated thinking-otter sprite derived from the existing OtterMark design, authored as inline SVG/CSS with no raster assets and no new runtime dependency
- [x] #2 A phrase appears as soon as the indicator mounts, starting at a random entry, then changes on a fixed interval without repeating the same phrase twice in a row
- [x] #3 Phrases live in a single frontend constant seeded with the list in this task's description, so adding one is a one-line change
- [x] #4 Screen readers get one stable status label (e.g. "Otto is thinking") rather than every rotating phrase; the playful text is hidden from assistive tech
- [x] #5 Under prefers-reduced-motion the sprite does not animate (matching the existing motion-reduce:animate-none usage in thread.aui.tsx)
- [x] #6 The rotation timer is cleared on unmount (reply starts streaming, user stops, or navigates away), with no leaked intervals
- [x] #7 Frontend tests cover immediate first phrase, rotation (fake timers), no immediate repeats, the stable accessible label, and cleanup; pnpm --dir frontend lint and test pass
- [x] #8 Rendered output is checked in the browser in light and dark themes and at phone width
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Sprite: pixel-art Otto bust (head + Purdue hoodie, paw on chin) authored as string-grid constants + palette, rendered to inline SVG (one <path> per colour, shape-rendering=crispEdges, integer 2x scale). Grids validated at import (row width, palette membership). No raster, no new dependency.
2. Animation: Tailwind v4 --animate-otto-* tokens + @keyframes in index.css with steps(1) timing (game-style frame cuts): 1-sprite-pixel idle bob, blink, chin-rub (arm static, only the fingers layer moves 1px sideways — user picked this over a claw-rake variant; moving the whole paw read as a fist pump), staggered thought dots. motion-reduce:animate-none on every animated part.
3. Phrases: OTTO_THINKING_PHRASES constant + useRotatingPhrase hook (random start via lazy useState, setInterval rotation, skip-ahead pick so never back-to-back repeats, cleared on unmount).
4. A11y: role=status holds only a sr-only 'Otto is thinking' label; sprite and phrase are aria-hidden siblings outside the live region.
5. thread.aui.tsx 'indicator' case renders <ThinkingOtto />.
6. Vitest with fake timers; lint + test + tsc.
7. Browser check light/dark + 375px; adversarial code review subagent; docs drift check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Design iterated with the user in a scratch prototype: bust as drafted, dark-brown outline (#3b2718) so it reads on the dark theme, paw-on-chin with option 1 (fingers rub) chosen at actual size.
Verification: pnpm --dir frontend lint clean; pnpm --dir frontend test 76/76; tsc -b clean. Mutation checks: replacing pickOtherIndex with Math.floor(Math.random()*length) fails both no-repeat tests; dropping clearInterval fails the cleanup test.
Browser (vite dev, stub adapter temporarily delayed and reverted): indicator renders in the assistant slot with no bubble in light + dark at desktop and 375px; longest phrase fits at 375px with no horizontal scroll; phrase rotated after 2.1s; 6 otto-* animations running with steps(1); bob measured as exactly 2 screen px (= 1 sprite px at 2x); Stop unmounts it and leaves 0 otto animations.
Code review (subagent): no correctness bugs. Applied: moved the rotating phrase out of the role=status live region (some SR/browser pairs re-read atomic regions on any text change), random-start test over two values, palette test scoped to the sprite group instead of a hard-coded dot count, type guard instead of cast + import-time grid validation. Not applied: empty-phrase-list guard (constant is non-empty; no speculative handling). Visual re-check after the a11y fix not repeated: it only moved role=status onto the already sr-only label span.
Known limitation: a live region inserted already containing text is not announced reliably by every screen reader; left as-is (the old dot announced nothing), flagged to the user.
Docs drift: README/project-spec/local-setup/AGENTS.md don't describe the indicator; no update needed. No architectural review needed (no contract, topology, dependency or service change).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced the thread's pulsing-dot indicator with ThinkingOtto: a pixel-art Otto sprite (string-grid constants -> inline SVG, one path per colour, steps(1) Tailwind v4 animations for bob, blink, chin-rub and thought dots, motion-reduce opt-out on every part) next to a phrase from OTTO_THINKING_PHRASES that shows immediately, rotates every 2s without back-to-back repeats, and clears its interval on unmount. Screen readers get only a stable 'Otto is thinking' role=status label; sprite and phrase are aria-hidden outside the live region. Verified with frontend lint, 76/76 Vitest (fake timers; mutation-checked no-repeat and cleanup), tsc -b, and a browser check in light/dark at desktop and 375px. PR team-play/pun-analysis-agent#46.
<!-- SECTION:FINAL_SUMMARY:END -->
