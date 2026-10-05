---
id: TASK-27
title: 'Frontend CI: redeploy on dependency changes, serialize deploys, build on PRs'
status: Done
assignee:
  - '@yaitorr'
created_date: '2026-09-25 02:01'
updated_date: '2026-10-04 20:57'
labels: []
dependencies: []
references:
  - .github/workflows/deploy-frontend.yml
  - .github/workflows/deploy-backend.yml
  - .github/workflows/test.yml
type: chore
project: frontend
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in TASK-8's code review (2026-09-24), when the deployed frontend switched to the live adapter. deploy-frontend.yml lags deploy-backend.yml in three ways, and the gaps now matter more because a bad or stale frontend deploy breaks real chat, not just a stub demo. Its paths filter misses the root package.json, pnpm-lock.yaml and pnpm-workspace.yaml, so a frontend-only dependency bump redeploys the backend but not the frontend. It has no concurrency group, so two quick pushes to main can finish out of order and leave the older build live, and no workflow_dispatch, so a redeploy needs a commit. And nothing builds the frontend (tsc -b && vite build) on pull requests: test.yml runs only vitest, so a type or build error first shows up as a failed deploy on main. deploy-backend.yml (TASK-13) already has the pattern to copy for the first two.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A change to the root package.json, pnpm-lock.yaml or pnpm-workspace.yaml on main triggers deploy-frontend.yml
- [x] #2 Frontend deploys are serialized by a concurrency group, and a manual workflow_dispatch run deploys main only
- [x] #3 Pull requests touching frontend/ run the production build (pnpm --filter frontend run build) with VITE_CHAT_ADAPTER unset, and fail on type or build errors
- [x] #4 Both deploy workflows deploy only after that package's tests pass, using one reusable workflow (workflow_call) that test.yml also uses, so the test steps are defined once
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Folded into PR #37 (TASK-8) with @yaisiel.torres, after Andi's review: nothing gated the frontend deploy on tests, and the ruleset requires no status checks, so a red PR merged with the live adapter on would ship broken chat. Option B chosen over copying deploy-backend.yml's inline test job (a third copy of the same steps) and over workflow_run (runs the default branch's workflow and loses paths filters). Required status checks in the ruleset stay a separate team decision.
1. .github/workflows/test-js.yml: on workflow_call, inputs package (string) and build (boolean, default false). Checkout, pnpm, Node 24, pnpm install --frozen-lockfile --filter <package> (verified in a clean clone: frontend tests 49/49 and build pass with the filtered install), test, and build when asked. The package name goes through env, not straight into the script.
2. test.yml: its JS matrix calls test-js.yml; frontend with build: true (AC #3; VITE_CHAT_ADAPTER is unset, so it builds the stub, and tsc -b catches type errors).
3. deploy-frontend.yml: root package.json/pnpm-lock.yaml/pnpm-workspace.yaml in paths (AC #1); workflow_dispatch, concurrency group per ref without cancel-in-progress, and deploy only on main (AC #2); a test job calling test-js.yml with needs: test (AC #4).
4. deploy-backend.yml: its inline test job becomes a call to test-js.yml, with the same main-only condition (AC #4).
5. Code review; docs (local-setup.md, engineering-practices.md) in a separate commit.
6. ACs #1, #2 and the deploy half of #4 can only be observed on main, so they're checked after #37 merges.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented per plan (commits 8077043, c0d904b; docs a0bd6c0, f1d8f0c). CI on a0bd6c0: Test run 36243536281 ran test-js.yml for both packages; the frontend job ran its production build (stub) and passed, the backend job skipped the build step, so the matrix-to-boolean input, if: inputs.build and the env-quoted --filter all work (AC #3). Deploy Backend run 36243536295 (PR) parsed with the reusable call: test skipped, image build ran as before. Code review: no bugs; confirmed a failing or cancelled test skips deploy-frontend's deploy (implicit success()), and that on main a failing backend test makes failure() true so build-and-deploy skips. Architectural review: no blockers. Fixed from both: test-js.yml header says a change there moves both deploy gates (deliberately not a deploy trigger; test.yml runs it on every PR); deploy-frontend.yml accepts that backend-only dependency bumps redeploy it (mirrors deploy-backend.yml); concurrency wording corrected (a newer push replaces a waiting run; newest commit wins); check renamed 'JS / Test (<package>)'. Accepted: on a main push frontend tests run twice and it builds twice (test.yml + deploy gate). Actions minutes are free on this public repo, and it's the price of gating without workflow_run. Check names changed, but the ruleset requires no status checks (the required-checks decision stays with the team). ACs #1, #2 and the deploy half of #4 are observable only on main: check after #37 merges.

Post-merge (2026-09-26), run 36245664862 (Deploy Frontend, 50e089c): 'test / Test (frontend)' ran 13:35:19-13:35:52, and 'Build and deploy to Firebase Hosting' started at 13:35:53, after it passed. Run 36245664866 (Deploy Backend): 'test / Test (backend)' ran before 'Build image (and deploy on main)'. Both deploys gate on test-js.yml, which test.yml also calls (AC #4). Still unobserved: AC #1 needs a push to main that changes only the root package.json, lockfile or workspace file (#38 changed the lockfile but also frontend/**, so it doesn't isolate the paths entry); AC #2 needs a concurrency overlap and a workflow_dispatch run.

AC #2 checked on configuration evidence, decided with @yaisiel.torres (2026-09-26); not exercised live. Concurrency: deploy-frontend.yml on main (50e089c) sets concurrency group deploy-frontend-${{ github.ref }} with cancel-in-progress: false. Per GitHub's semantics, that allows one running and at most one pending run per ref, and a newer run replaces a pending one. deploy-backend.yml uses the same pattern. No real overlap has happened yet: the 8 most recent Deploy Frontend runs never overlapped, so there's no run history to cite. We decided against forcing one, because it would mean redeploying main twice. Main-only workflow_dispatch: deploy-frontend.yml has workflow_dispatch plus if: github.ref == 'refs/heads/main' on the deploy job, and the deploy has needs: test, so a manual run on another branch runs the tests and skips the deploy. The live check (a manual run on a non-main branch) was deliberately skipped by @yaisiel.torres; the condition matches deploy-backend.yml's DEPLOY guard.

AC #1 observed (2026-09-28): d9472ad (TASK-30, #43) changed the root package.json, pnpm-lock.yaml and pnpm-workspace.yaml and nothing under frontend/** or deploy-frontend.yml, and its push to main triggered Deploy Frontend run 36267984342 (success). This isolates the root-manifest paths entries, which #38 could not (it also changed frontend/**).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
deploy-frontend.yml now redeploys on root dependency changes, serializes deploys per ref, and allows main-only manual runs. Both deploy workflows gate on the reusable test-js.yml, which test.yml also calls, and PRs run the frontend production build. Verified on main: the deploy gates in runs 36245664862/36245664866, and the root-paths trigger in run 36267984342 (d9472ad, root manifests only). AC #2 was checked from the workflow configuration, not a live overlap, as decided with @yaisiel.torres.
<!-- SECTION:FINAL_SUMMARY:END -->
