---
id: TASK-61
title: Shared Gemini pacer for experiments and scripts
status: To Do
assignee:
  - '@yaitorr'
created_date: '2026-10-04 20:15'
updated_date: '2026-10-04 20:57'
labels: []
dependencies: []
references:
  - AGENTS.md
  - docs/experiments/task-31/README.md
  - docs/experiments/task-45/README.md
priority: medium
type: enhancement
project: backend
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Gemini free-tier quota is per project and per model, shared by production, local keys and experiments (AGENTS.md, "Gemini quota"). Experiments have used up production's quota twice: TASK-45 spent gemini-3.8-flash's 20 requests/day, and TASK-31's last run started four Backends at once, hit the per-minute limits, then the daily limits on gemini-3.5-flash-lite and gemini-3.8-flash. On 2026-10-04 both Flash-Lite models were reported over their limits after TASK-31's runs the day before, while the deployed site was answering "The assistant is busy right now". AGENTS.md now states the rules (estimate requests not replies, half the daily quota per day unless a whole day is announced to the team, no gemini-3.8-flash, one paced run at a time, stop at the first 429), but each experiment script (docs/experiments/task-38/record.mjs, task-45/check.mjs, task-47/compare.mjs, task-32/measure.mjs) hand-rolls its own loop, and nothing enforces them. A shared pacer lets every script follow the rules by using it. TASK-60's 2026-10-05 experiments are paced by hand rather than wait for this task; later runs of that kind are the expected users.

Experiments reach Gemini two ways today: in-process through createChatFlow (task-47, task-32) and over HTTP to a local Backend (task-38, task-45). The pacer cannot see teammates' runs, so the daily share (half, or the announced whole day) stays a team convention it can only enforce per run.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A run is paced to at most two thirds of each model's requests/min from AGENTS.md's Gemini quota table, and no two Gemini requests run concurrently
- [ ] #2 Every run uses exactly one pinned model: in-process runs get a one-model ladder, and HTTP runs start their own local Backend with GEMINI_MODEL set (or refuse to start), so a 429 reaches the run instead of stepping down the ladder
- [ ] #3 Requests are counted as Gemini requests, not replies: tool rounds and Backend backoff retries count wherever the run can observe them, and where it cannot (a Backend over HTTP) a documented per-reply upper bound is used
- [ ] #4 Before the first request, a run whose declared request estimate is above half of its model's requests/day refuses to start unless it explicitly opts in to AGENTS.md's announced whole-day exception, and even then refuses above that exception's ceiling (about 85% of the day); a run that reaches its declared budget stops
- [ ] #5 The first 429 (RESOURCE_EXHAUSTED) stops the run without retrying or switching models, and the results gathered so far are kept
- [ ] #6 A run that targets the ladder's last-resort model (gemini-3.8-flash today, the model AGENTS.md reserves for production) is refused
- [ ] #7 The limits are read from a single source shared with AGENTS.md's table (or the table moves to wherever that source is and AGENTS.md links to it), so there is still only one current copy of the numbers
- [ ] #8 Usable from both in-process experiments (createChatFlow) and experiments that call a local Backend over HTTP, with at least one existing experiment script converted as the example
- [ ] #9 Tests with a fake clock cover the pace, the budget refusal and stop, the 429 stop, the pinning requirement and the last-resort-model refusal, and make no Gemini calls
- [ ] #10 AGENTS.md's Gemini quota section tells agents to use the pacer for any run that calls Gemini
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->
