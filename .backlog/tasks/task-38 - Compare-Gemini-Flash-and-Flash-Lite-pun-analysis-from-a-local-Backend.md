---
id: TASK-38
title: Compare Gemini Flash and Flash-Lite pun analysis from a local Backend
status: To Do
assignee: []
created_date: '2026-09-27 20:49'
labels: []
dependencies:
  - TASK-9
references:
  - backend/src/genkit.ts
  - docs/local-setup.md
  - 'https://aistudio.google.com/rate-limit'
  - 'https://ai.google.dev/gemini-api/docs/pricing'
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decided with @yaisiel.torres (2026-09-27): keep the current model (gemini-flash-latest, currently gemini-3.8-flash) for now, and decide from a side-by-side comparison run locally whether to stay on it or switch.

Why it matters: the product is how well Gemini explains puns. That's especially true for llm_fallback, where Gemini supplies the senses itself (TASK-20), and for the undetermined result production returns until TASK-11. Flash-Lite (gemini-3.5-flash-lite) is smaller, so it may explain worse, but its free tier is far roomier: 15 requests/min and 500/day, against Flash's 5 and 20 (AI Studio rate-limit page, 2026-09-27). It's also cheaper on the paid tier (/bin/zsh.30/.50 vs /bin/zsh.75/.75 per 1M tokens; Flash doubles on 2027-01-01). Each pun question costs at least 2 requests since TASK-9. The outcome feeds TASK-37 (demo billing and model pin).

Constraints: run it from a local Backend (pnpm dev, see docs/local-setup.md), not the deployed site, and don't change the production model in this task. Flash's free tier is 20 requests/day per project and shared with the deployed site, so run the Flash half after the daily quota resets, and keep the prompt set small enough to fit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A fixed set of prompts is written down before running: at least one homographic pun, one homophonic pun, one non-pun, one pun no dictionary tier would explain (llm_fallback-style), and one follow-up question in the same conversation
- [ ] #2 Each prompt is run through gemini-3.8-flash and gemini-3.5-flash-lite from a local Backend with the same code and fixture, and both full replies are saved (e.g. as recorded /api/chat streams)
- [ ] #3 The replies are compared on criteria agreed before looking at them: calls analyze_pun when it should, correct verdict, names both senses, clear explanation, and requests used per question. The comparison is recorded in this task
- [ ] #4 A decision is recorded (stay on Flash, switch to Flash-Lite, or another model) with its reasons, and TASK-37 is updated to match; the production model is unchanged by this task
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->
