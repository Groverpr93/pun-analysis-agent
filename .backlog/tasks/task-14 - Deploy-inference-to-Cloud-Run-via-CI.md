---
id: TASK-14
title: Deploy inference to Cloud Run via CI
status: In Progress
assignee:
  - '@yaisiel.torres'
created_date: '2026-09-17 23:40'
updated_date: '2026-09-28 10:03'
due_date: '2026-09-21'
labels: []
milestone: m-4
dependencies: []
references:
  - docs/local-setup.md
  - .github/workflows/deploy-inference.yml
  - docs/project-spec.md
project: inference
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
deploy-inference.yml is currently a placeholder, identical in structure to deploy-frontend.yml — nothing in inference/ has ever reached Cloud Run. Slice 4's milestone and TASK-11 both assume a 'deployed Inference Cloud Run /analyze endpoint' exists to swap in, but nothing stands that service up. This task closes that gap: Dockerfile, Cloud Run service config, and the CI deploy step, independent of the classifier/WSD work tracked separately (TASK-1 and the untracked detection/sense-selection work noted on TASK-11).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pushing to main with a change under inference/** builds the container and deploys it to Cloud Run
- [x] #2 The Cloud Billing account / card-on-file requirement from docs/project-spec.md's stack notes is satisfied for the shared GCP project (or confirmed already satisfied)
- [ ] #3 Required secrets/config are documented in docs/local-setup.md and consumed from GitHub Secrets
- [ ] #4 The deployed Cloud Run URL responds on whatever inference/ currently exposes, even before the real classifier/WSD logic lands
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Decision (2026-09-28, Yai): Inference is IAM-protected, not public. Only Backend calls it, so only Backend's runtime SA (pun-agent-runtime) gets roles/run.invoker; TASK-11's swap then needs an ID-token-carrying fetch.

1. Dockerfile: multi-stage per uv's Docker guide. uv only in the build stage (uv sync --locked --no-dev); runtime stage copies .venv + WordNet + Wiktionary data and runs .venv/bin/uvicorn directly, as a non-root user, on $PORT. Measured 2026-09-28: the current CMD's 'uv run' re-resolves the lockfile at every container start and fetches en-core-web-sm's metadata from GitHub (exits 2 with no network), so every cold start depends on GitHub; the uv binary also adds 49 MB.
2. Reusable .github/workflows/test-python.yml (uv sync --locked, WordNet download, pytest), called by test.yml and gating the deploy (TASK-27's suggestion).
3. deploy-inference.yml mirroring deploy-backend.yml: PRs build the image only; main runs tests, pushes to Artifact Registry, deploys Cloud Run service pun-agent-inference with --no-allow-unauthenticated, a dedicated no-roles runtime SA, min 0 / max 1 instances; smoke-tests that an anonymous request is refused (403) and an authenticated GET /openapi.json succeeds (AC #4: /analyze is NotImplementedError until TASK-16).
4. One-time GCP setup (with Yai's confirmation before each command): create runtime SA pun-agent-inference@ (no roles); after the first deploy, grant pun-agent-runtime roles/run.invoker on the service. Document both in docs/local-setup.md.
5. AC #2: billing already enabled (gcloud billing projects describe pun-agent -> billingEnabled: true); record as evidence.
6. Artifact Registry: repo is 127.5 MB; the inference image is ~327 MB compressed (~937 MB unpacked), so ~455 MB of the 0.5 GB free tier after the first push. Record the measured size after the Dockerfile change and flag the cleanup-policy follow-up.
7. Code review + architectural review subagents (new deploy target); docs drift check (local-setup.md, project-spec.md, README.md, AGENTS.md) as a separate commit.

Revision (2026-09-28, after reviews): step 4's invoker grant is no longer manual. deploy-inference.yml re-applies pun-agent-runtime's roles/run.invoker on every deploy (Yai's choice), and --invoker-iam-check is set. A build-time data check (WordNet + Wiktionary lookup as the app user) was added to the Dockerfile. WordNet-in-its-own-stage deferred to TASK-39; registry retention to TASK-40.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
From TASK-27 (2026-09-26): the JS deploys now gate on a reusable test-js.yml (workflow_call) that test.yml also calls, and use a concurrency group plus a main-only workflow_dispatch. When the inference deploy becomes real, consider the same for Python: a reusable test-python.yml (uv sync --locked + pytest; eval's unittest job could share it) that test.yml calls and deploy-inference.yml gates on.

From TASK-17 (PR #25): the Inference image now carries ~206 MB of WordNet data (`oewn:2025`) and a 66 MB Wiktionary file (978 MB image locally). Check the compressed size against Artifact Registry's 0.5 GB free tier with 5 images kept (docs/local-setup.md), and tune the cleanup policy if needed. The Dockerfile's `ADD --checksum` requires BuildKit, which Cloud Build and `docker build` use by default.

2026-09-28: Dockerfile rewritten multi-stage. Measured (linux/amd64, OrbStack): compressed 327 MB -> 219 MB. Verified in the container: starts and serves /openapi.json with --network none (old image exited 2 on uv run's GitHub fetch); WordNet (7 senses) and Wiktionary (11 senses) lookups for 'interest' work as the non-root app user; PORT honored; uvicorn is PID 1 and exits 0 on SIGTERM. .dockerignore now also drops tests/ and scripts/. Added reusable test-python.yml (test.yml calls it; deploy gates on it) and a real deploy-inference.yml (private service, 403/ID-token smoke tests). YAML parses; no actionlint locally, so the PR's build-only run is the first real check.

2026-09-28: Created runtime SA pun-agent-inference@pun-agent.iam.gserviceaccount.com (Yai approved); 0 project roles. Added actionlint (rhysd/actionlint:1.7.12 image, bundles shellcheck) as a lint.yml job at Yai's request: repo passes; a deliberately broken workflow fails it (exit 1, expression + SC2086). Checked uv run --frozen on the old image with --network none: it starts fine (no GitHub fetch), but uv stays PID 1 with uvicorn as its child. docs/local-setup.md: new Inference deploy section + setup table + invoker-grant command; actionlint command in the lint section.

2026-09-28 review fixes: code + architectural review subagents run. Applied in this change: build-time data check (RUN as app user asserting WordNet + Wiktionary senses for "interest"; verified it fails the build for a bad WN_DATA_DIR and for a missing wiktionary.sqlite); deploy re-applies pun-agent-runtime's roles/run.invoker on every deploy (Yai chose this over a manual one-time grant); --invoker-iam-check added; 403-test comment corrected (--no-allow-unauthenticated does remove allUsers; the test guards against gcloud only warning if that fails); "only Backend can invoke" wording corrected (project admins can too); URL passed via env in both smoke steps; path-filter trade-off documented. Follow-ups: TASK-39 (WordNet own stage, deferred by Yai), TASK-40 (registry retention: 3 versions per push; cleanup not deleting). Notes added to TASK-11 (ID-token fetch etc.), TASK-32 (depends on TASK-16 in practice), TASK-19 (memory/image size). Docs drift (engineering-practices.md:33/35, project-spec.md:113/127, contracts.md auth note + :78, backend comments, eval/README.md) goes in a separate follow-up commit.

AC #2 evidence: gcloud billing projects describe pun-agent -> billingEnabled: true, billingAccountName billingAccounts/014653-B96948-6A92FE (2026-09-28). DoD: code review + architectural review subagents done (findings and fixes in notes above); docs drift fixed in a separate commit (engineering-practices.md, project-spec.md, contracts.md [contract access note flagged], eval/README.md, stale comments in backend/src/app.ts and analyze-pun.ts). AC #1, #3, #4 stay open until the first main deploy proves them (deploy + push, GCP_SA_KEY consumed, both smoke tests passing).
<!-- SECTION:NOTES:END -->
