---
id: TASK-13
title: Deploy backend to Cloud Run via CI
status: Done
assignee:
  - '@yaitorr'
created_date: '2026-09-17 23:40'
updated_date: '2026-10-04 20:57'
due_date: '2026-09-21'
labels: []
milestone: m-2
dependencies: []
references:
  - docs/local-setup.md
  - .github/workflows/deploy-backend.yml
  - docs/project-spec.md
project: backend
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
deploy-backend.yml is currently a placeholder, identical in structure to deploy-frontend.yml (see the comment at the top of the file) — nothing in backend/ has ever reached Cloud Run. Slice 2's milestone claims a Backend 'live on Cloud Run,' and TASK-8's live-adapter work needs a real Backend URL to point at, but neither TASK-7 (the Gemini proxy code) nor anything else actually stands up the Cloud Run service. This task closes that gap: Dockerfile, Cloud Run service config, and the CI deploy step, independent of what TASK-7 implements inside the app.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pushing to main with a change under backend/** builds the container and deploys it to Cloud Run
- [x] #2 The Cloud Billing account / card-on-file requirement from docs/project-spec.md's stack notes is satisfied for the shared GCP project (or confirmed already satisfied)
- [x] #3 The deployed Cloud Run URL responds on whatever backend/ currently exposes (e.g. /health), even before TASK-7's /api/chat route lands
- [x] #4 The Gemini API key lives in Secret Manager (secret gemini-api-key-runtime in pun-agent) and reaches the service only via Cloud Run's --set-secrets as GEMINI_API_KEY, never via GitHub; GCP deploy credentials stay in GitHub Secrets (GCP_SA_KEY); both are documented in docs/local-setup.md
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. One-time GCP setup (done, owner-approved step by step; see notes): Gemini key pun-agent-runtime in the no-billing AI Studio project, secret gemini-api-key-runtime, runtime SA pun-agent-runtime with access to that secret only, CI allowed to deploy as it, Artifact Registry repo pun-agent (us-east1) with a keep-5 cleanup policy.
2. backend/Dockerfile: repo-root context; pnpm pinned from packageManager; frozen filtered install; tsc; 'pnpm deploy --legacy --prod --frozen-lockfile' for production-only node_modules; runtime as USER node. backend/Dockerfile.dockerignore as an allowlist (keeps .env.local out).
3. pnpm-workspace.yaml: ignoredOptionalDependencies @genkit-ai/firebase (prod node_modules 611MB -> 186MB; server verified from the resulting tree).
4. deploy-backend.yml: PRs build only; main (push or manual run) runs backend tests, then builds, pushes a SHA-tagged image, deploys with the runtime SA, the secret, --allow-unauthenticated, min 0/max 1, and smoke-tests /health. Serialized with a concurrency group; contents: read.
5. Code review + architectural review; docs (local-setup, engineering-practices, project-spec) in a separate commit.
6. After merge: first deploy verifies AC #1 and #3; check the real image size.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Key decisions (2026-09-23, with @yaisiel.torres): the Cloud Run service gets its own new Gemini API key, created in the AI Studio project gen-lang-client-0125403786 (display name 'pun-agent', billing OFF), not in the GCP project pun-agent (billing ON, required by Cloud Run). Reason: with billing off the key stays on Gemini's free tier, so abuse of the public /api/chat can only exhaust quota, never charge the card (the abuse hole itself is TASK-25, Firebase App Check). Known trade-off: free-tier limits are per project, so production shares quota with local-dev keys in that project (pun-agent-local). Own key rather than reusing the existing 'pun-agent' key, so it can be revoked without breaking local dev. The key is stored in Secret Manager in pun-agent and read by a dedicated least-privilege runtime service account (not the default compute SA, which has Editor).

Step 1 done (2026-09-23): created Gemini API key 'pun-agent-runtime' (uid ffb41c61-5e36-48f4-9292-a545924bcdd2) in gen-lang-client-0125403786, restricted to generativelanguage.googleapis.com; its value was never printed. Name chosen over 'pun-agent-backend' because, after the Tier 3 redesign (PR #31), Backend is the only runtime Gemini caller. AC #3 reworded (approved): the Gemini key goes to Secret Manager instead of GitHub Secrets, so it never leaves GCP, rotates without touching CI, and isn't visible in plain text in the Cloud Run service configuration.

Step 2 done (2026-09-23): the owner confirmed in AI Studio that all keys in gen-lang-client-0125403786 are on the Free tier. Enabled secretmanager.googleapis.com on pun-agent; created secret gemini-api-key-runtime (automatic replication) and stored the key as version 1 by piping get-key-string into 'secrets versions add --data-file=-' (the key was never printed). Stripped the trailing newline that --format='value(keyString)' adds; a stored newline would have made Gemini reject the key. Verified without revealing it: SHA-256 prefixes of the key and the secret match (9c085b92f6f1), the secret is 39 bytes, and it has no trailing newline.

Steps 3-4 done (2026-09-23): created service account pun-agent-runtime@pun-agent.iam.gserviceaccount.com (the backend's Cloud Run runtime identity, instead of the default compute SA with Editor). Granted roles/secretmanager.secretAccessor on the gemini-api-key-runtime secret only, and roles/iam.serviceAccountUser to github-actions-deployer on that one SA only, so CI can deploy services that run as it. Verified: the secret's policy lists only pun-agent-runtime; the SA's policy lists only github-actions-deployer; pun-agent-runtime has no project-level roles (least privilege: a compromised backend can reach only the key it already uses). AC #2 checked: gcloud billing projects describe pun-agent reports billingEnabled: True (billing account 014653-B96948-6A92FE).

Deploy settings decided (2026-09-23, with @yaisiel.torres): region us-east1 for both the Cloud Run service and the Artifact Registry repo. Owner asked for the region closest to the east coast; Google's free-tier page (docs.cloud.google.com/free/docs/free-cloud-features) gives Cloud Run's free tier (2M requests, 180k vCPU-s, 360k GB-s per month) with no region restriction beyond 1 GB/month free egress from North America, and Artifact Registry's 0.5 GB free storage with none. us-east1 over us-east4 because it's also in the free-tier region lists for other services (Compute Engine, Cloud Storage), and keeping the repo in the same region avoids cross-region image pulls. --max-instances=1 and --min-instances=0: the Node backend is I/O-bound on Gemini, so one instance at Cloud Run's default concurrency (80) covers the demo, and the cap stops a flood of requests on the public URL (before TASK-25) from scaling out and burning the compute free tier. Scale-to-zero keeps idle cost at zero at the price of a cold start.

Artifact Registry (2026-09-23): created Docker repo 'pun-agent' in us-east1 (one repo for all pun-agent Cloud Run images, e.g. us-east1-docker.pkg.dev/pun-agent/pun-agent/backend:<git-sha>); github-actions-deployer already holds roles/artifactregistry.writer. To do: a cleanup policy (e.g. keep the last N versions), since every SHA-tagged deploy adds an image and the free tier is 0.5 GB. FINDING, open decision for the owner: github-actions-deployer also holds roles/iam.serviceAccountUser at PROJECT level (not listed in docs/local-setup.md), so it can deploy as any SA in pun-agent, including the default compute SA with Editor. That makes the resource-level grant on pun-agent-runtime (step 4) redundant. Removing the project-level role would restore least privilege; first check that nothing else relies on it (Firebase Hosting deploys shouldn't need it).

Decision (2026-09-23, @yaisiel.torres): accept the current GitHub/CI access model for this school project. (1) github-actions-deployer keeps its project-level roles/iam.serviceAccountUser (not narrowed to pun-agent-runtime), and (2) CI keeps authenticating with the long-lived GCP_SA_KEY JSON key (an org-level GitHub secret, confirmed working by the frontend deploys), rather than switching to Workload Identity Federation. Both trade some least privilege and credential hygiene for simplicity. Revisit if the project outlives the course. The runtime side stays least-privilege: pun-agent-runtime can read only its one secret.

Cleanup policy applied (2026-09-23): keep-5-most-recent (Keep) + delete-older-than-1d (Delete, any tag state), dry run off.

Reviews (code review high + architectural review; no blockers). Fixed: workflow_dispatch could deploy any branch (now main only); no concurrency (now serialized per ref); no permissions block (contents: read); no test gate before deploy (test job, deploy needs it); IMAGE/SA duplicated project and region (now derived); gha cache unscoped (scope=backend, so TASK-14's image won't clobber it); npm-installing pnpm would break on a +sha512 packageManager suffix (now stripped; kept npm over Corepack because Node stops bundling Corepack from v25); added --frozen-lockfile to pnpm deploy. Checked and NOT a problem: 'legacy deploy may re-resolve versions' (npm has hono 4.13.8, the deployed tree has the locked 4.13.7). Stale allowBuilds '@firebase/util' entry removed; backend/package.json's conflicting packageManager (pnpm@10.18.2) removed. Accepted: root package.json/lockfile in the paths filter redeploys on frontend-only dependency bumps (documented in the workflow).

Follow-ups: (a) the pnpm 12 deploy output contains ~91MB of unreferenced package copies under node_modules/.pnpm/@ and .pnpm/@<scope> (separate files, not hardlinks; enable-global-virtual-store=false doesn't prevent them). Check the real image size in Artifact Registry after the first push; if the waste is there, remove those dirs in the build stage (the architectural review verified the server still works without them). (b) TASK-8 AC #2 needs deploy-frontend.yml to build with VITE_CHAT_ADAPTER=live and VITE_BACKEND_URL=https://pun-agent-backend-203365930808.us-east1.run.app (project number 203365930808); nobody owns that edit yet. (c) TASK-14 (Inference deploy) should get its own runtime SA rather than reuse pun-agent-runtime (which can read the Gemini key), and Phase 2 must set INFERENCE_URL in this workflow's deploy env or analyze_pun falls back to 'undetermined'. (d) Optional: add https://pun-agent.firebaseapp.com (Firebase Hosting's second domain) to backend CORS defaults.

Post-merge verification (2026-09-24): the first real deploy was run 36046598515 (push to main, #35, 6c933b1): test job passed, image built and pushed as backend:6c933b1, deployed as revision pun-agent-backend-00001-fdf, /health smoke test passed (AC #1, #3). The earlier #28 push run 36046277141 ran the old placeholder workflow from its own commit, so it deployed nothing. gcloud run services describe: runs as pun-agent-runtime, GEMINI_API_KEY from secretKeyRef gemini-api-key-runtime:latest, maxScale 1 (AC #4; documented in docs/local-setup.md 'Backend deploy'). Live checks: GET /health 200; CORS preflight from https://pun-agent.web.app returns a matching allow-origin; a real POST /api/chat streamed message chunks then a result event. Follow-up (a): the pushed image is ~92.7 MB compressed; the ~91 MB of unreferenced .pnpm copies is still unmeasured inside it. Follow-up (b) done on the TASK-8 branch; (d) done there too (firebaseapp.com added to CORS defaults, with a test). DoD #1/#2: code and architectural reviews recorded in the notes above; DoD #3: docs follow-up commit shipped in #32.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Backend deploys to Cloud Run from CI: Dockerfile, least-privilege runtime SA, Gemini key via Secret Manager, deploy-backend.yml (PRs build only; main tests, builds, pushes, deploys, smoke-tests /health). Verified by the first real deploy (run 36046598515), gcloud's service description, and live /health, CORS and /api/chat checks.
<!-- SECTION:FINAL_SUMMARY:END -->
