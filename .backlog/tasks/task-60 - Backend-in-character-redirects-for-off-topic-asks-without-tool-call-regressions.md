---
id: TASK-60
title: >-
  Backend: in-character redirects for off-topic asks, without tool-call
  regressions
status: To Do
assignee: []
created_date: '2026-10-04 00:16'
updated_date: '2026-10-04 20:43'
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
- [ ] #4 Each experiment finishes within one quota day on gemini-3.5-flash-lite, pinned: its main baseline runs the same day, it follows AGENTS.md's Gemini quota rules (request estimate recorded before starting; the whole-day exception only when announced to the team), and no conclusion pools runs from different days. Runs are recorded under docs/experiments/task-31/
- [ ] #5 Every reply in both experiments that called analyze_pun is graded for pun type: Otto's stated type matches the tool's pun_type, contradicts it, or isn't stated; the README reports the counts per variant, so a homophonic/homographic mix-up can be traced to Otto or to Inference's classifier
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Budget sketch (2026-10-04, decided with Yai; revise when picking this up). The resume plan in docs/experiments/task-31/README.md (~190 replies, ~350 requests) would exceed half of a Flash-Lite model's 500 requests/day, and splitting it across days would break the same-day-baseline lesson. So the work is two one-day experiments, each planned to about 225 requests (250 minus a 10% reserve for retries). A shown or hidden example, or an analyzed pun, costs 2 requests; a decline, a redirect or a no-call reply costs 1.

Experiment 1, ablation (which edit makes Otto decline example requests): main, cue only, rule v2 only, cue + rule v2; the three example requests only; 8 runs per cell, interleaved. That is 96 replies, about 190 requests, and 24 example replies per variant, enough to separate 17/17 from 9/17 (round 6).

Experiment 2, candidate check (ACs #1-#3), on a later day once Experiment 1 has picked the wording: main vs the candidate; "Give me 20 puns." (AC #2), the three example requests and kitten + atoms (AC #3), France (AC #1 voice); 7 runs per cell. That is 98 replies, about 170 requests. If the candidate fails, a retry is a new one-day experiment with its own main baseline, not a continuation.

Pinned model: gemini-3.5-flash-lite, production's first rung, so results describe what users get (chosen over 3.1-flash-lite by Yai, accepting that it shares production's primary model's quota). Dropped on purpose: the second half of the TASK-31 hypothesis (that the rule alone makes Otto redirect users' own puns) is not ablated; Experiment 2 still checks users' puns for the chosen wording, which is what AC #3 needs.

Depends on TASK-61 so the pacer enforces the pin, the pace, the budget and the stop at the first 429.

Update (2026-10-04, decided with Yai): Yai is fine using gemini-3.5-flash-lite's whole day, so AGENTS.md gained an announced whole-day exception (up to about 85% of requests/day; production falls back to gemini-3.1-flash-lite once 3.5 runs out). Yai is announcing Monday 2026-10-05 and Tuesday 2026-10-06 to the team; the exception applies only once that message is out. Both experiments run on Monday: Experiment 1 (~190 requests), then, after picking the candidate wording from its results, Experiment 2 (~170), about 360 of a ~425 ceiling. Each keeps its own same-day main baseline. Tuesday is held for a retry if the candidate fails, as a new experiment with its own baseline.

Out of scope (Yai): Otto reintroducing himself more than once in a conversation. It needs multi-turn conversations to measure, and academically the rule breaks this task targets matter more, above all calls to analyze_pun the system instruction doesn't ask for (an unnecessary Inference call), such as on "Give me 20 puns." itself.

Update (2026-10-04, decided with Yai): Monday's runs don't wait for TASK-61's pacer, so TASK-60 no longer depends on it (this supersedes the dependency note above). They follow AGENTS.md's Gemini quota rules by hand: in-process with a one-model ladder (gemini-3.5-flash-lite) as docs/experiments/task-47/compare.mjs does, one request at a time with at least 6 s between requests (10/min), the request count logged as it goes, and the run stopping at the first 429.

Pun-type grading added (AC #5): Yai has seen Otto mix up homophonic and homographic. pun_type comes from Inference, so for each reply that called analyze_pun, compare the type Otto states with the tool's pun_type (match, contradicts, not stated). Contradictions point at the system instruction; a wrong type stated faithfully points at the classifier. The tool results and replies are already recorded, so this costs no extra requests.
<!-- SECTION:NOTES:END -->
