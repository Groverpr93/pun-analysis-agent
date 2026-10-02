---
id: TASK-57
title: 'Frontend: make the analyze_pun card lighter now that it shows probabilities'
status: To Do
assignee:
  - '@yaisiel.torres'
created_date: '2026-10-02 10:04'
labels: []
milestone: m-4
dependencies:
  - TASK-16
references:
  - frontend/src/components/pun/analyze-pun-tool-ui.tsx
  - frontend/src/components/pun/summarize-analyze-pun-call.ts
project: frontend
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR 85 added a three-row probability panel to the expanded analyze_pun card. Rendered on 2026-10-02, the card contradicts itself (the header says "Pun probability 94%" while the panel says the numbers are not calibrated confidence), shows two-decimal percentages more precise than the model is, pushes the explanation below the numbers, and keeps the full raw JSON always open. The panel's formatting is inline JSX, while the header's lives in the tested summarize-analyze-pun-call.ts, and no fixture includes `probabilities`. Decided with Yai on 2026-10-02: relabel the header, put the explanation first, and use a stacked bar.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The collapsed header reads "Model score N%" with a whole percent
- [ ] #2 The expanded card shows, in order: the quote with every `words_involved` word highlighted (case-insensitive), the explanation, the probabilities, and the raw response
- [ ] #3 Probabilities render as one stacked bar with a legend in whole percents and an uncalibrated hint; its colors are theme tokens that pass the dataviz skill's palette validator in light and dark mode
- [ ] #4 The raw /analyze JSON is collapsed by default behind a "Raw response" toggle
- [ ] #5 A result whose `probabilities` is null or missing renders without the bar
- [ ] #6 Fixtures include `probabilities`, and tests cover the formatting, the highlighting and the missing-probabilities case
- [ ] #7 Frontend comments give the right reason `probabilities` is optional (threads saved before it existed), and the fixture comment saying production returns the undetermined result until TASK-11 is gone
- [ ] #8 The card is checked rendered at desktop and phone widths
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->
