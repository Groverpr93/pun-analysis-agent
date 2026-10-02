---
id: TASK-57
title: 'Frontend: make the analyze_pun card lighter now that it shows probabilities'
status: In Progress
assignee:
  - '@yaisiel.torres'
created_date: '2026-10-02 10:04'
updated_date: '2026-10-02 11:24'
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
- [ ] #1 The collapsed header reads "Pun score N%" with a whole percent, for pun and non-pun verdicts alike
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Stack on PR 85's head (b5dd5f7) as task-57-lighter-card; frontend only, so it does not overlap TASK-55; rebase onto main once PR 85 merges.
2. summarize-analyze-pun-call.ts: header label "Pun score N%" (decided with Yai 2026-10-02: "Model score" read as the not-a-pun class's score on non-pun verdicts). Add summarizeProbabilities(result): bar segments with exact widths and whole-percent labels, null when probabilities is null or missing.
3. A pure helper splits the quote into highlighted/plain runs for every words_involved word: case-insensitive, whole words, longest first; rendered as <mark>; unit tests.
4. Card order: quote, explanation, stacked bar + legend + uncalibrated hint, then a "Raw response" toggle collapsed by default (ui/collapsible, as the card itself uses).
5. Colors: the dataviz skill's first three categorical slots (blue, orange, aqua; light #2a78d6/#eb6834/#1baf7a, dark #3987e5/#d95926/#199e70) replace the unused gray --chart-1..3 in index.css. Validated --pairs all against the app's surfaces (light #fdfaf6, dark #17130e): all pass; aqua is 2.71:1 in light, so every value is also shown as text in the legend. Order homographic, homophonic, non-pun, so the pun segments together equal the header's score. No hover tooltip (the legend labels every value); aria-label carries all three.
6. Fixtures gain probabilities (undetermined: null); fix the analyze-result.ts and fixture comments; update App.test.tsx's card names and raw-response test.
7. Tests, lint, render at desktop and phone widths in light and dark, then a review subagent.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented on task-57-lighter-card (stacked on PR 85 head b5dd5f7): validated --chart-1..3 colors, probabilities in fixtures (undetermined fixture omits the key, like Backend's own undetermined result and the recorded streams), and the redesigned card (Pun score label, highlighted words, explanation, stacked bar + legend, collapsed Raw response). Review subagent found the legend could sum to 101% and disagree with the header when classes were rounded separately; fixed by rounding the pun score once and splitting it between the pun types (tested over 201 splits). Bar logic moved to its own tested component. 162 frontend tests pass; rendered at desktop and phone widths in light and dark. Backend's undetermined result omitting probabilities was added to TASK-52 as an acceptance criterion.
<!-- SECTION:NOTES:END -->
