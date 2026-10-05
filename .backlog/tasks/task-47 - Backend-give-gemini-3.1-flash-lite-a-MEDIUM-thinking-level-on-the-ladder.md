---
id: TASK-47
title: 'Backend: give gemini-3.1-flash-lite a MEDIUM thinking level on the ladder'
status: Done
assignee:
  - '@yaitorr'
created_date: '2026-09-29 09:19'
updated_date: '2026-10-04 20:57'
labels: []
dependencies:
  - TASK-45
references:
  - docs/experiments/task-45/README.md
  - backend/src/flows/model-ladder.ts
  - backend/src/config.ts
  - packages/timeouts/index.js
priority: medium
type: enhancement
project: backend
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-45 found gemini-3.1-flash-lite often describes an analyze_pun result the tool never returned when answering a follow-up, with its own history as much as another model's. With no thinking config it produces no thought tokens (same as MINIMAL). A first comparison (2026-09-29, same two recorded histories, Backend's own chat flow) went from 2/10 follow-ups reporting the actual result at the default to 9/10 at thinkingLevel MEDIUM. Genkit builds each request's config from the ladder's first model ref and modelLadder sends it to every rung, so a per-model setting needs the ladder to apply each rung's own config. MEDIUM thinks before the first chunk, which counts against MODEL_STALL_LIMIT_MS (30 s).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The comparison is committed under docs/experiments/task-47/: gemini-3.5-flash-lite and gemini-3.1-flash-lite, default vs MEDIUM, on the same recorded histories, with how often each reply reports the actual resent result and each reply's time to first chunk and total time
- [x] #2 modelLadder applies each rung's own model config to that rung's calls only, so one model's config never reaches another; tested against Genkit test-double models
- [x] #3 Production's ladder gives each model the thinking level the comparison supports (at least MEDIUM for gemini-3.1-flash-lite), and GEMINI_MODEL pinned to a ladder model keeps that model's config
- [x] #4 The measured times to first chunk at the chosen levels fit within MODEL_STALL_LIMIT_MS, or the gap is recorded and a fix agreed with the user
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. docs/experiments/task-47/compare.mjs: Backend's chat flow per model and level (googleAI.model(name, {thinkingConfig})), each receiver given its own and the other Flash-Lite model's recorded first turn from task-45's runs, N=5 each; record reply, time to first non-empty chunk and total. Grade replies: grounded / misreport / other (rubric fixed before reading).
2. modelLadder: each rung's calls get the generate call's config with that rung's ref config over it; chat.ts gives Genkit the first model without its config so it can't leak. Tests with test-double models recording the config they receive.
3. config.ts: a per-model config map applied in genkit.ts (also when GEMINI_MODEL pins one ladder model).
4. Check TTFC vs MODEL_STALL_LIMIT_MS; docs (README, config comments, task-45 README pointer).
5. Code + architectural review; stacked PR on #77.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-29: comparison run 09:20 UTC (docs/experiments/task-47): 3.5 grounded 10/10 at default and MEDIUM (median first chunk 1.8 s -> 4.1 s); 3.1 0/9 -> 7/10 (2.8 s -> 4.1 s, slowest 7.3 s). Decision: MEDIUM for 3.1 only (GEMINI_MODEL_CONFIG). modelLadder now gives each rung's calls the generate call's config with that rung's ref config over it; chat.ts passes withoutModelConfig(models[0]) so rung 0's config can't leak. toReplyParts moved to docs/experiments/resent-parts.mjs (shared with task-45's check). Backend 171/171, tsc + Biome clean. Mutation checks: dropping the per-rung merge, reversing its precedence, chat.ts keeping the first model's config, genkit.ts not applying GEMINI_MODEL_CONFIG, and a no-op withoutModelConfig each fail a test.

Reviews (code + architectural subagents): no blocking issues; config isolation, no thought text in reply/result (plugin maps thoughts to reasoning parts, chunk.text excludes them), no deploy ordering beyond merging #77 first. Fixed: README medians were upper medians (true: 3.5 1.7 -> 3.7 s, 3.1 2.8 -> 4.0 s); reply #34 (3.5 default) regraded misreport, so 3.5 is 9/10 at default vs 10/10 at MEDIUM (decision unchanged, wording fixed in config.ts/README); ladder test now uses a key only rung 1 sets (topP), plus tests for a settled model's later calls and for version; withoutModelConfig also strips version (Genkit copies it into every request and the plugin would call that version); isRef helper; contracts sentence limited to Gemini-supplied refs; timing may include retries; TASK-32 note added; .env.example and task-45 README note that pinned/rerun models keep GEMINI_MODEL_CONFIG. Backend 173/173, tsc + Biome clean; 6 mutations each fail a test.

Merged in #78 as 57dc9bc (2026-09-29). Lint, Test and Deploy Backend passed on main.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
gemini-3.1-flash-lite now thinks at MEDIUM on /api/chat's ladder, the only model to get a thinking level. The comparison (docs/experiments/task-47, same recorded histories through Backend's own chat flow) found 3.1 reported the resent analyze_pun result in 0/9 follow-ups at its default (no thought tokens, like MINIMAL) vs 7/10 at MEDIUM, for about 1.3 s more before the first chunk. 3.5 was 9/10 vs 10/10, not worth about 2 s on most replies, so it stays at default. To make a per-model setting possible, modelLadder gives each rung's calls that rung's own ref config over the generate call's, and chat.ts starts Genkit with withoutModelConfig(models[0]) so rung 0's config and version can't reach other rungs. The settings live in GEMINI_MODEL_CONFIG (config.ts), applied in genkit.ts, including when GEMINI_MODEL pins a ladder model. All first chunks were under 7.4 s against the 30 s stall limit; first turns at MEDIUM are left to TASK-32. Verified by backend 173/173 (new ladder, chat-flow and genkit tests; 6 mutations each fail one), tsc and Biome clean, and code and architectural reviews with their findings fixed.
<!-- SECTION:FINAL_SUMMARY:END -->
