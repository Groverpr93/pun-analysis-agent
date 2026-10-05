---
id: TASK-44
title: One source of truth for cross-domain timeouts
status: Done
assignee:
  - '@yaitorr'
created_date: '2026-09-28 16:31'
updated_date: '2026-10-04 20:57'
labels: []
dependencies:
  - TASK-42
references:
  - docs/contracts.md
  - docs/engineering-practices.md
  - backend/src/flows/stall-guard.ts
  - backend/src/tools/analyze-pun.ts
  - frontend/src/lib/chat/live-chat-model-adapter.ts
  - .github/workflows/deploy-backend.yml
  - backend/Dockerfile
priority: medium
type: enhancement
project: backend
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The timeouts that make up /api/chat's waiting chain live in five places with only prose in docs/contracts.md relating them: INFERENCE_TIMEOUT_MS (backend/src/tools/analyze-pun.ts), MODEL_STALL_LIMIT_MS (backend/src/flows/stall-guard.ts, TASK-42), APP_CHECK_TIMEOUT_MS (frontend/src/lib/chat/live-chat-model-adapter.ts), Frontend's silence limit (TASK-28, not built) and Cloud Run's request timeout (implicit 300 s default: deploy-backend.yml sets no --timeout). Their relationships matter: Frontend's silence limit must exceed Backend's maximum silence (stall limit + Inference timeout) plus startup (App Check token, cold start), and Cloud Run's timeout must exceed a reply's worst case, which TASK-43's retries lengthen. A change to one today can silently break another across a deploy boundary.

Agreed with the user on 2026-09-28: a pnpm workspace package shared by Frontend and Backend is the likely shape. Env overrides of these values are local-development only, refused on Cloud Run the way APP_CHECK=off is (backend/src/config.ts), so production always matches the shared values.

Known costs to plan for: backend/Dockerfile's 'pnpm deploy --legacy' assumes no workspace dependencies, and its .dockerignore allowlist; both deploy workflows' path filters; docs/engineering-practices.md's statement that Frontend consumes only the /api/chat contract, and its consumer-first deploy rule, which a shared file doesn't remove: a change that lengthens the silence must still reach Frontend first.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One workspace module holds the waiting chain's timeouts (Inference timeout, model stall limit, App Check token timeout, Frontend's silence limit, Cloud Run request timeout) and the derived maximum silence; Backend and Frontend import them from it, and no copy of those values remains in either
- [x] #2 Tests fail if the relationships between them break: Frontend's silence limit above the maximum silence plus the App Check timeout and a stated margin, and Cloud Run's timeout above a reply's documented worst case
- [x] #3 deploy-backend.yml sets Cloud Run's --timeout explicitly from the module, both deploy workflows redeploy on a change to it, and the backend image builds with it
- [x] #4 docs/contracts.md points to the module for the values instead of restating them, and docs/engineering-practices.md documents the shared module as part of the Frontend/Backend boundary, including deploy order when a value changes
- [x] #5 Any env override of a shared timeout works locally only: the server refuses to start with one on Cloud Run, as with APP_CHECK=off
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Agreed with the user on 2026-09-28, after TASK-43's handoff notes: TASK-44 lands first; TASK-43 then moves its backoff values into the module.
1. packages/timeouts (@pun-agent/timeouts): plain ESM index.js + hand-written index.d.ts, no build step (Node won't strip types under node_modules, where pnpm deploy puts it in the backend image). Inputs: INFERENCE_TIMEOUT_MS 20 s, MODEL_STALL_LIMIT_MS 15 s, APP_CHECK_TIMEOUT_MS 10 s, MAX_TOOL_ROUNDS 5, CLOUD_RUN_REQUEST_TIMEOUT_MS 300 s, CLOUD_RUN_MARGIN_MS 20 s, FRONTEND_SILENCE_MARGIN_MS 15 s, FRONTEND_SILENCE_LIMIT_MS 60 s (stated, not derived, so the test means something). Derived: MAX_SILENCE_MS (35 s), BASELINE_REPLY_WORST_CASE_MS ((rounds+1) x stall + rounds x inference = 190 s), RETRY_BUDGET_MS (Cloud Run - baseline - margin = 90 s).
2. Relationship tests (node:test in the package): Frontend limit >= max silence + App Check + margin; retry budget fits at least one retry (>= stall limit now; TASK-43 adds its longest backoff wait); Cloud Run timeout is whole seconds within Cloud Run's 3600 s max.
3. Backend and Frontend import the values; no copies remain. chat.ts passes maxTurns: MAX_TOOL_ROUNDS explicitly.
4. No env overrides (none exist today); the module notes any future one needs config.ts's K_SERVICE guard.
5. Dockerfile/.dockerignore build with the workspace dependency; deploy-backend.yml sets --timeout from the module; both deploy workflows' path filters and test gates include the package; test.yml gets a timeouts job.
6. Docs: contracts.md points to the module; engineering-practices.md documents the shared module and deploy order when a value changes; drift check on README/project-spec/local-setup/AGENTS.
7. Code review + architectural review subagents.

Final values after review (supersede the numbers in steps 1-2 above): MODEL_STALL_LIMIT_MS 30 s, MAX_TOOL_ROUNDS 3, CLOUD_RUN_REQUEST_TIMEOUT_MS 400 s, FRONTEND_SILENCE_LIMIT_MS 75 s; derived MAX_SILENCE_MS 50 s, BASELINE_REPLY_WORST_CASE_MS 300 s (counting each call's tail), RETRY_BUDGET_MS 80 s. An extra test checks the baseline against a reply walked through gap by gap.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-28 (from TASK-43's planning, implemented in a separate thread): TASK-43 adds values to /api/chat's waiting chain that this module should own. Until TASK-44 lands, they live in Backend (planned: backend/src/flows/model-ladder.ts; name may change, check TASK-43's final summary).
- Backoff per ladder rung: 3 attempts, waits of 1 s then 2 s, plus a little jitter. A 429 steps down with no wait.
- Keepalives: while retrying, Backend sends data: {"message": ""} when an attempt fails and again when its wait ends. That's why the maximum silence (MODEL_STALL_LIMIT_MS + INFERENCE_TIMEOUT_MS = 35 s) doesn't change. It holds only while the longest backoff wait is <= the stall limit, so that's a relationship worth a test here (AC #2).
- Retry budget per reply: 90 s, derived as Cloud Run request timeout (300 s) - baseline worst case (190 s) - margin (20 s). Baseline = 6 model calls x MODEL_STALL_LIMIT_MS (15 s) + 5 tool rounds x INFERENCE_TIMEOUT_MS (20 s). 6 calls because Genkit's default maxTurns is 5 (generate/action.js: maxTurns ?? 5, i.e. 5 tool rounds). Failed attempts and backoff waits count against the budget; a retry starts only if spent + wait + stall limit fits.
- So a reply's documented worst case (AC #2's Cloud Run relationship) = baseline + retry budget = 280 s. When AC #3 sets --timeout explicitly, derive the budget from it rather than restating 90 s, and make maxTurns an explicit input if the flow ever sets it.
- TASK-43 doesn't create the shared module and leaves docs/contracts.md's silence numbers as they are, to avoid colliding with this task. It may add a sentence about keepalives and the retry budget next to the existing timeout paragraphs.

2026-09-28: Implemented per plan; code + architectural reviews done and their no-decision findings fixed. Open decisions (discussed with the user, not yet settled): (A) BASELINE_REPLY_WORST_CASE_MS counts one stall limit per model call, but MAX_SILENCE_MS also counts a call's tail after its last chunk; counting it at today's values gives 280 s and a 0 s retry budget. Leading option: MAX_TOOL_ROUNDS = 2 (the legitimate maximum under the TASK-31.1 prompt: analyze a text, then write and analyze one example), giving a 130 s baseline and a 150 s budget at Cloud Run's 300 s. (B) A CI check that a change's new silence fits under main's FRONTEND_SILENCE_LIMIT_MS: recommended for TASK-28, once Frontend enforces the limit. For TASK-43: its retry test must add its longest backoff wait to 'one retry' in packages/timeouts/tests/relationships.test.js, plus a test that the wait fits within the stall limit.

2026-09-28: Decision (A) settled with the user: MAX_TOOL_ROUNDS = 2, and BASELINE_REPLY_WORST_CASE_MS counts each model call's tail (2 x stall limit per call), consistent with MAX_SILENCE_MS. Baseline 130 s, RETRY_BUDGET_MS 150 s at Cloud Run's 300 s (TASK-43 planned 90 s; it's derived, so TASK-43 gets 150 s by importing it). system-instruction.ts and the module now point at each other: a prompt change that chains more analyze_pun calls must raise MAX_TOOL_ROUNDS. (B) stays open, recommended for TASK-28.

2026-09-28: At the user's request (to be conservative about slow first chunks), MODEL_STALL_LIMIT_MS is back to 30 s. The relationship tests then required FRONTEND_SILENCE_LIMIT_MS >= 50 + 10 + 15 = 75 s, so it's now 75 s (safe in one change: TASK-28 hasn't built the limit yet). Baseline 220 s, RETRY_BUDGET_MS 60 s (still >= one 30 s retry). Decision (B) moved to TASK-28 as AC #5, along with importing FRONTEND_SILENCE_LIMIT_MS (AC #1).

2026-09-28: After the delta review found the 2-round cap fragile (the prompt asks for one call per text but not all in one round, so two texts analyzed in sequence plus an example would take 3 rounds and fail with ABORTED), the user chose MAX_TOOL_ROUNDS = 3 with Cloud Run's timeout raised to 400 s (option B) over tightening the prompt or lowering the stall limit. Retry budget 80 s.

2026-09-28 validation after merge (#72, 63ce5cc): Test, Lint, Deploy Backend and Deploy Frontend all succeeded on main; the live Cloud Run service (revision pun-agent-backend-00014) reports timeoutSeconds 400, set from CLOUD_RUN_REQUEST_TIMEOUT_MS. pnpm test on main: timeouts 6, backend 133, frontend 141. No copy of a chain value remains in backend/src or frontend/src (the only 30_000 is the stub adapter's simulated SLOW_TOOL_CALL_MS, not part of the chain). No env var reads any of them (AC #5 holds by having no overrides; the module header and engineering-practices.md say a future one must be refused on Cloud Run). AC #1 note: FRONTEND_SILENCE_LIMIT_MS lives in the module, but Frontend can't import it until TASK-28 builds the limit (its AC #1 now requires that import).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added packages/timeouts (@pun-agent/timeouts), the one place /api/chat's waiting chain is defined. Inputs: Inference timeout 20 s, model stall limit 30 s, App Check timeout 10 s, max tool rounds 3, Cloud Run request timeout 400 s, Frontend silence limit 75 s. Derived: max silence 50 s, baseline worst case 300 s (each model call's tail counted), and a retry budget of 80 s for TASK-43. Backend and Frontend import it. chat.ts passes maxTurns explicitly, and deploy-backend.yml sets Cloud Run's --timeout from it. Both deploy workflows redeploy on it and run its tests, and the backend image ships it via pnpm deploy --legacy. It's plain ESM plus index.d.ts, because Node won't strip types in node_modules. Relationship tests check that the Frontend limit covers silence + App Check + margin, the budget fits a retry, the baseline matches a gap-by-gap walk, and the .d.ts matches the .js. Each test was mutation-checked. Decided with the user during review: count call tails; stall limit back to 30 s; 3 rounds with a 400 s timeout rather than tightening the prompt; the deploy-order CI check moves to TASK-28 (AC #5). Verified: CI and both deploys green on 63ce5cc, and the live service's timeout is 400 s. Code, architectural and delta reviews done. contracts.md, engineering-practices.md and the drift docs updated.
<!-- SECTION:FINAL_SUMMARY:END -->
