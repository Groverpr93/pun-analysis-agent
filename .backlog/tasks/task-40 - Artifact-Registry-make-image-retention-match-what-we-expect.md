---
id: TASK-40
title: 'Artifact Registry: make image retention match what we expect'
status: To Do
assignee: []
created_date: '2026-09-28 09:46'
updated_date: '2026-09-28 10:06'
labels: []
dependencies:
  - TASK-14
references:
  - docs/local-setup.md
  - .github/workflows/deploy-backend.yml
  - .github/workflows/deploy-inference.yml
priority: high
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-28: Yai approved this task and wants it done soon. Ruled out one cause: the repo's cleanupPolicyDryRun is unset (false), so the policies are not in dry-run mode.
<!-- SECTION:NOTES:END -->
