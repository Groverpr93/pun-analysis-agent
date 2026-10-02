---
id: TASK-52
title: 'Backend: harden analyze_pun''s authenticated call to Inference'
status: To Do
assignee:
  - '@yaisiel.torres'
created_date: '2026-10-02 10:04'
labels: []
milestone: m-4
dependencies:
  - TASK-11
references:
  - backend/src/tools/inference-fetch.ts
  - backend/src/tools/analyze-pun.ts
  - .github/workflows/deploy-backend.yml
project: backend
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR 85 added `backend/src/tools/inference-fetch.ts`, a hand-written metadata-server client that attaches an ID token on Cloud Run. It has no tests, detects Cloud Run from `K_SERVICE` separately from `config.ts`, fetches a token on every call, and a failed token fetch is logged as cause "unreachable", which points whoever reads the logs at networking instead of auth. `deploy-backend.yml` resolves `INFERENCE_URL` with `echo "url=$(gcloud ...)"`, so a failed lookup does not fail the step and surfaces later as Backend failing to start on `new URL("")`. Backend's new probabilities rule is untested, and nothing in Backend says why `probabilities` is optional: threads saved in the browser before the field existed still send results without it. Decided 2026-10-02: use google-auth-library, already in the production dependency tree through firebase-admin.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ID tokens come from google-auth-library, at the major version firebase-admin already pulls in so the image does not grow, with token caching; the hand-written metadata client is removed
- [ ] #2 Whether Backend runs on Cloud Run is decided once, in `config.ts`
- [ ] #3 A failed token fetch is logged with its own cause, distinct from unreachable, timeout and non_2xx
- [ ] #4 Tests cover `INFERENCE_URL` validation, the token being attached only on Cloud Run and only for Inference's origin, and the token-failure log cause
- [ ] #5 Tests cover the probabilities rule: summing to 1, agreeing with confidence, absent when the result is undetermined, and an omitted field accepted
- [ ] #6 A comment on the Zod `probabilities` field says why it is optional
- [ ] #7 `deploy-backend.yml` fails the step that resolves Inference's URL when the URL cannot be read
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->
