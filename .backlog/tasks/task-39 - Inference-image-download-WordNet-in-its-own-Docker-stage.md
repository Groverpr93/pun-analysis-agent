---
id: TASK-39
title: 'Inference image: download WordNet in its own Docker stage'
status: To Do
assignee: []
created_date: '2026-09-28 09:46'
labels: []
dependencies:
  - TASK-14
references:
  - inference/Dockerfile
  - docs/local-setup.md
priority: low
type: chore
project: inference
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In inference/Dockerfile (TASK-14), `wn download oewn:2025` runs in the build stage after `COPY pyproject.toml uv.lock` and `uv sync`. Any uv.lock change (or a GitHub Actions cache miss) therefore rebuilds the ~97 MB WordNet layer along with the ~360 MB venv, and each rebuilt layer gets a new digest that Artifact Registry stores again. With the image at ~219 MB compressed and the shared repo already holding ~143 MB of Backend images (0.5 GB free tier), two such rebuilds kept by the cleanup policy can exceed the free tier. Moving the download into its own stage that does not depend on uv.lock (as the Wiktionary download already does) keeps that layer stable across dependency bumps. Trade-off to settle: that stage needs its own `wn` install, whose version can drift from the one locked in uv.lock; the WordNet database schema has to match the runtime `wn`. Deferred out of TASK-14 by Yai (2026-09-28).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A uv.lock-only change rebuilds the venv layer but reuses the WordNet data layer (same layer digest before and after)
- [ ] #2 The runtime `wn` reads the separately downloaded WordNet data; the image build fails if it cannot (the build-time data check added in TASK-14 still passes)
- [ ] #3 Whatever pins the WordNet stage's `wn` version is tied to, or checked against, the version in inference/uv.lock, so a `wn` bump cannot silently leave them mismatched
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->
