---
id: TASK-60
title: >-
  Backend: in-character redirects for off-topic asks, without tool-call
  regressions
status: To Do
assignee: []
created_date: '2026-10-04 00:16'
labels: []
dependencies: []
references:
  - docs/experiments/task-31/README.md
  - backend/src/flows/system-instruction.ts
priority: low
type: enhancement
project: backend
ordinal: 56000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Otto's off-topic redirects are flat on main ('Analyzing and explaining puns is what I help with!'), which TASK-31.1's AC #4 wanted in character. A 2026-10-03 attempt showed a playful cue in PURPOSE's redirect sentence fixes the voice, but it made Gemini call analyze_pun on 'Give me 20 puns.' itself, and the ANALYZE_PUN_RULE sentence that stopped that made Otto decline example-pun requests. All edits were reverted. An ablation to tell cue from rule was cut short by free-tier quota; docs/experiments/task-31/README.md records every wording tried, the numbers, a design for resuming, and the untested hypothesis that the rule alone makes Otto redirect legitimate puns.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Off-topic requests are redirected back to puns in Otto's playful voice, without loosening TASK-12's scope rules (the AC moved here from TASK-31.1)
- [ ] #2 Measured side by side with main's instruction on the same pinned model, a batch request ('Give me 20 puns.') makes no more analyze_pun calls than on main
- [ ] #3 Measured the same way, single example-pun requests ('Tell me a pun about otters.', 'Write me a pun.', 'Tell me a pun.') get one shown, analyzed example as often as on main, and users' own puns phrased as commands or addressed to 'you' are still analyzed
- [ ] #4 The runs, including the cue-only and rule-only ablation, are recorded under docs/experiments/task-31/ and paced so they don't exhaust the project's shared free-tier quota
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->
