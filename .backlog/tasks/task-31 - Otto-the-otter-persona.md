---
id: TASK-31
title: Otto the otter persona
status: Done
assignee: []
created_date: '2026-09-27 15:02'
updated_date: '2026-10-04 20:00'
labels: []
milestone: m-5
dependencies: []
type: feature
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The app already looks like an otter mascot (TASK-22) but doesn't act like one: Gemini answers in a neutral general-assistant voice, and while it thinks the UI shows a generic pulsing dot. This umbrella groups the work that makes the agent consistently present as Otto, a friendly, playful anthropomorphized otter who only does pun analysis, in both what he says (backend system instruction) and how he looks while working (frontend loading state). Scope limiting itself stays with TASK-12.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Both subtasks (backend persona, frontend loading animation) are Done
- [x] #2 In a manual end-to-end check against the deployed or local app, Otto's voice in replies and the thinking animation read as the same character as the TASK-22 mascot
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TASK-31.2 Done; TASK-31.1 merged (#67) and deployed, with AC #4 pending a live check blocked by Gemini 503s on 2026-09-28. Deployed app check: the thinking otter and rotating phrases render in production; Otto's reply could not be observed there because Gemini returned 503.

2026-10-03: TASK-31.1's AC #4 (in-character redirects) attempted and reverted; prompt edits traded it against tool-call regressions. See docs/experiments/task-31/README.md. TASK-31 stays In Progress until AC #4 is met or explicitly dropped.

2026-10-04 end-to-end check on the deployed app (pun-agent.web.app, dark theme), user confirmed AC #2. Thinking state: the glasses-wearing otter sprite from the header mark, with animated thought dots and rotating phrases visible at once ('double-checking the double meaning...' -> 'optimizing the paperclip factory...' -> 'cracking the shell...'), shown again after the analyze_pun card while the explanation streamed. Voice: 'Who are you?' -> 'I'm Otto, a friendly otter in glasses and a black and gold Purdue hoodie! I love diving deep into wordplay...', ending with a request for a sentence; the banker pun -> opens with 'That's punny!', then a clean homographic analysis of 'interest'. Off-topic redirects are still flat; that's TASK-60, not a character mismatch. DoD: code and architectural reviews were done per subtask (TASK-31.1, TASK-31.2); this umbrella adds no code; docs drift checked, none.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Otto the otter is now consistent across what he says and how he looks while working: TASK-31.1 gave Gemini's system instruction his persona (name, glasses, Purdue hoodie, 'That's punny!', at most one otter touch, one analyzed example pun at most), and TASK-31.2 replaced the pulsing dot with a thinking-otter sprite and rotating phrases. Verified end to end on the deployed app on 2026-10-04. In-character off-topic redirects were attempted, reverted for tool-call regressions, and moved to TASK-60 (docs/experiments/task-31/README.md).
<!-- SECTION:FINAL_SUMMARY:END -->
