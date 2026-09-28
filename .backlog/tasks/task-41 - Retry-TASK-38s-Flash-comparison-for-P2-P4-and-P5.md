---
id: TASK-41
title: 'Retry TASK-38''s Flash comparison for P2, P4 and P5'
status: To Do
assignee:
  - '@yaisiel.torres'
created_date: '2026-09-28 10:00'
updated_date: '2026-09-28 10:01'
labels: []
dependencies:
  - TASK-38
references:
  - docs/experiments/task-38/README.md
  - docs/experiments/task-38/record.mjs
priority: low
project: backend
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-38 compared gemini-flash-latest (gemini-3.8-flash) with gemini-3.5-flash-lite on five fixed food-pun prompts, but Flash answered only P1 and P3: P2 and P4 got Gemini's 503 'model is currently experiencing high demand' on two attempts on 2026-09-28, so P5 (P4's follow-up) never ran. Production switched to gemini-flash-lite-latest on the results so far. This finishes the Flash half if there's time, so the comparison is complete before anyone decides to switch the demo back to Flash (TASK-37).

How: in backend/, run the dev server on Flash (GEMINI_MODEL=gemini-flash-latest pnpm dev; the default is now Flash-Lite), with APP_CHECK=off in .env.local. Then from the repo root: node docs/experiments/task-38/record.mjs gemini-flash-latest --only p2-homophonic,p4-no-dictionary,p5-follow-up. It costs about 6 of Flash's 20 free requests/day; that quota is per model, so production no longer spends it. Score with the rubric in docs/experiments/task-38/README.md, unchanged.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Flash replies for P2, P4 and P5 are recorded under docs/experiments/task-38/gemini-flash-latest/, with P5 sent in the same run as P4
- [ ] #2 They are scored with TASK-38's unchanged rubric, and the README's results table and summary.json are updated
- [ ] #3 If the scores change the case for Flash-Lite, the README's decision section and TASK-37 say so
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->
