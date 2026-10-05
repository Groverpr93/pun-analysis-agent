---
id: TASK-40
title: 'Artifact Registry: make image retention match what we expect'
status: In Progress
assignee:
  - '@yaitorr'
created_date: '2026-09-28 09:46'
updated_date: '2026-10-04 20:57'
labels: []
dependencies:
  - TASK-14
references:
  - docs/local-setup.md
  - .github/workflows/deploy-backend.yml
  - .github/workflows/deploy-inference.yml
priority: medium
type: chore
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The shared `pun-agent` Docker repo (us-east1) has cleanup policies keep-5-most-recent and delete-older-than-1d, and docs/local-setup.md describes that as keeping the 5 most recent images. Found during TASK-14 (2026-09-28): (1) every docker/build-push-action push creates 3 versions (image index, image manifest, provenance attestation), so "keep 5" keeps fewer than 2 deploys, not 5; (2) the policies do not appear to be deleting anything: Backend had 12 versions listed on 2026-09-28, several older than 1 day and outside the 5 most recent, and the repo grew from 127.5 MB to 143 MB. With the Inference image (~219 MB compressed) sharing the repo, the 0.5 GB free tier has little headroom. Overshooting is billed against promo credits rather than blocking anything, but the goal is to stay under the free tier.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The cause of old versions not being deleted is identified (e.g. dry-run mode, policy semantics, or evaluation delay) and fixed, with evidence from a versions listing
- [ ] #2 Retention keeps a deliberate number of deploys per image (Backend and Inference), accounting for index/manifest/attestation versions (e.g. provenance disabled on build-push-action, or keepCount adjusted)
- [ ] #3 docs/local-setup.md states the actual retention depth and current repo size against the 0.5 GB free tier
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Decision (2026-09-28, Yai): provenance off, keep 3 deploys per image.
1. provenance: false on docker/build-push-action in deploy-backend.yml and deploy-inference.yml, so each deploy is one registry version (verified locally with a buildx docker-container builder + local registry: provenance on pushes an OCI image index, off pushes a single image manifest).
2. docs/local-setup.md: an Image retention subsection covering how the keep and delete policies combine, the ~1-day cadence, the transition, Cloud Run's own image copy for serving revisions, the measured size, and the policy JSON and command; update both Docker repo table rows.
3. After merge, wait until each image (backend, inference) has 3 provenance-free pushes. Under keep-3, older 3-version pushes would leave only 1-2 deploys. Then apply the complete policy set (delete-older-than-1d + keep-3-most-recent) with set-cleanup-policies, which replaces all existing policies (verified in gcloud 584's source: --policy writes the whole repository.cleanupPolicies map; the old --overwrite flag was removed). Verify with list-cleanup-policies, remove the transition sentence from local-setup.md, and confirm with a versions list about a day later.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-28: Yai approved this task and wants it done soon. Ruled out one cause: the repo's cleanupPolicyDryRun is unset (false), so the policies are not in dry-run mode.

2026-09-28 correction (research): the cleanup policies DO run. Evidence: Backend pushes on 2026-09-24 (runs for 07fd20f, 6c933b1) and 2026-09-26T13:35Z (run 36245664866, 50e089c) pushed images (build-push-action + deploy succeeded) and none of their versions exist anymore. The 'not deleting' observation was a misreading: gcloud printed times in local EDT, and with keep-5-most-recent + delete-older-than-1d every version younger than ~1 day is kept regardless of count (KEEP wins only for the 5 newest; DELETE only matches >1 day). At 2026-09-28T10:21Z the only deletion-eligible Backend versions (pushed 2026-09-26T20:01Z) had been eligible ~14 h, within the documented ~1-day cadence ('Changes take effect within approximately one day'). Deletions are logged in Data Access logs (off by default), so an empty Admin Activity log proves nothing. Also from the docs: cleanup never deletes an image referenced by a parent manifest (index) until the index is deleted. So AC #1's 'fix' is: no fix needed; the remaining work is AC #2/#3 (deliberate retention depth, docs).

2026-09-28 code review (subagent) findings, all fixed before commit: (1) set-cleanup-policies replaces the whole set rather than merging by name, so the docs had it backwards and could have led someone to drop the keep policy; confirmed in gcloud 584's set_cleanup_policies.yaml. (2) Deleting a serving revision's image doesn't affect Cloud Run, which keeps its own copy; reworded. (3) The repo size (393 MB) and a worst-case estimate were missing from the docs (AC #3); added. (4) During the transition, keep-3 would hold only 1-2 deploys, so the policy change waits for 3 provenance-free pushes per image. Not done (low, optional): a CI check that a push produced a single manifest rather than an index, to guard against a future platforms:/sbom: change.

From TASK-19 (Andi, 2026-09-28): the PR adding scoring.py bakes fastembed + all-MiniLM-L6-v2 into the Inference image. Compressed image measured locally at ~333 MB vs ~207 MB on main (+126 MB, mostly onnxruntime and the 87 MB model), and its dependency change means new venv/model layers rather than shared ones. With the repo at 393 of 500 MB on 2026-09-28, the first deploy after it merges will likely push the registry past the free tier until older versions are cleaned up. Please confirm how to handle it before that PR merges.
<!-- SECTION:NOTES:END -->
