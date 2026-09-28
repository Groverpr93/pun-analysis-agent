---
id: TASK-11
title: 'Backend: swap analyze_pun fixture for real Inference /analyze'
status: To Do
assignee: []
created_date: '2026-09-17 23:34'
updated_date: '2026-09-28 09:29'
due_date: '2026-09-21'
labels: []
milestone: m-4
dependencies:
  - TASK-1
  - TASK-9
  - TASK-14
  - TASK-16
  - TASK-21
references:
  - docs/contracts.md
  - docs/project-spec.md
project: backend
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-9 deliberately calls Inference through an injectable client backed by a fixture so Backend/Frontend Phase 2 work isn't blocked on Inference's ML readiness. Once Inference's real /analyze endpoint is deployed to Cloud Run (TASK-14), this swaps the fixture client for the real HTTP call. Depends on TASK-9, TASK-14, and the milestone m-6 Inference-quality chain: TASK-1's candidate extraction, TASK-16's Detection classifier, and TASK-21 (which transitively pulls in TASK-17-19's sense-selection steps 2-6). Data/Eval's dataset work (TASK-2) is parallel, not a hard blocker.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 analyze_pun's injectable client calls the deployed Inference Cloud Run /analyze endpoint instead of the fixture
- [ ] #2 An end-to-end conversation on the Firebase-hosted frontend returns real is_pun/pun_type/explanation/confidence/sense_source values, not fixture data
- [ ] #3 TASK-9's fixture-based tests still pass unchanged; only the default runtime client changes
- [ ] #4 A cold-started or timed-out Inference request falls back to docs/contracts.md's undetermined /analyze result, per docs/project-spec.md's Cloud Run cold-start caveat
- [ ] #5 Once deployed, an Inference failure's analyze_pun WARNING keeps its stack in exception.stacktrace and does not appear in Error Reporting (carried over from TASK-29, the first point where it can happen in production)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Accepted gap (2026-09-23 Tier 3 redesign): real Inference can go live emitting sense_source llm_fallback before Backend has fallback guidance (TASK-20, which needs TASK-12 in m-5). Until then, llm_fallback results reach Gemini unguided; it usually improvises an explanation. Deliberately not made a dependency, to avoid pulling m-5 work ahead of m-4.

Also accepted: from TASK-9 (m-3) onward Backend returns the undetermined result (is_pun: null) on timeouts/errors, but Gemini has no instruction for it until TASK-20 (m-6). is_pun: null is fairly self-explanatory to Gemini, so this gap is accepted too.

From TASK-9 (2026-09-27): the injectable client is fetch itself. app.ts passes fixtureFetch (backend/src/tools/analyze-pun-fixture.ts) to createAnalyzePunTool; this task's swap is fixtureFetch -> the global fetch, plus setting INFERENCE_URL on the Cloud Run service. The timeout, non-2xx and malformed handling already runs (and is tested) in TASK-9, including against the real fetch and a local server.

From TASK-9's architectural review (2026-09-27), for the swap: (1) config.inferenceUrl falls back to http://localhost:8000 even on Cloud Run, so a forgotten INFERENCE_URL would silently degrade every call to the undetermined result. Consider refusing to start when K_SERVICE is set and INFERENCE_URL isn't, as config.ts already does for APP_CHECK=off. (2) If Inference's Cloud Run service is IAM-protected rather than public (undecided; see TASK-14), a plain fetch won't authenticate; the swap would then need an ID-token-carrying fetch, not just fixtureFetch -> fetch. (3) inference/main.py's response model is behind docs/contracts.md (no sense_source, is_pun/confidence not nullable), so until TASK-16 AC #4 lands, every real response fails Backend's schema and degrades to undetermined, with only a warning (cause=malformed) logged.
<!-- SECTION:NOTES:END -->
