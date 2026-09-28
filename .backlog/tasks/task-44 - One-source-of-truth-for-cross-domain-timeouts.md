---
id: TASK-44
title: One source of truth for cross-domain timeouts
status: To Do
assignee:
  - '@yaisiel.torres'
created_date: '2026-09-28 16:31'
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
- [ ] #1 One workspace module holds the waiting chain's timeouts (Inference timeout, model stall limit, App Check token timeout, Frontend's silence limit, Cloud Run request timeout) and the derived maximum silence; Backend and Frontend import them from it, and no copy of those values remains in either
- [ ] #2 Tests fail if the relationships between them break: Frontend's silence limit above the maximum silence plus the App Check timeout and a stated margin, and Cloud Run's timeout above a reply's documented worst case
- [ ] #3 deploy-backend.yml sets Cloud Run's --timeout explicitly from the module, both deploy workflows redeploy on a change to it, and the backend image builds with it
- [ ] #4 docs/contracts.md points to the module for the values instead of restating them, and docs/engineering-practices.md documents the shared module as part of the Frontend/Backend boundary, including deploy order when a value changes
- [ ] #5 Any env override of a shared timeout works locally only: the server refuses to start with one on Cloud Run, as with APP_CHECK=off
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->
