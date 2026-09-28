---
id: TASK-26
title: 'Backend: run TypeScript with Node 24 type stripping instead of tsx'
status: Done
assignee:
  - '@yaisiel.torres'
created_date: '2026-09-23 13:46'
updated_date: '2026-09-28 08:42'
labels:
  - backend
  - tooling
dependencies: []
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Node 24 (the repo floor since the Node 24 upgrade, PR #33) runs .ts files directly by stripping types, so the backend no longer needs tsx as a dev-time loader for `pnpm dev` and `pnpm test`. Dropping it removes a dev dependency and means dev and tests run on the same Node that runs production, rather than through a separate esbuild-based transform. The catch is that Node does not remap `./x.js` specifiers to `./x.ts` the way tsc/tsx do, so relative imports and tsconfig must change too.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 backend `dev` and `test` scripts run on plain `node` (no tsx), and tsx is removed from backend devDependencies and the lockfile
- [x] #2 tsconfig rejects TypeScript syntax that type stripping cannot run, so it fails at typecheck rather than at runtime
- [x] #3 `pnpm --filter backend build` still emits runnable JS in dist/ (the Docker image starts and serves /health)
- [x] #4 Backend tests, lint and scripts/verify-setup.mjs pass
- [x] #5 Docs that mention tsx for the backend are updated
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. tsconfig: add erasableSyntaxOnly (reject enums/namespaces/parameter properties), verbatimModuleSyntax (type-only imports must say `import type`, since Node keeps untyped imports at runtime) and rewriteRelativeImportExtensions (tsc emits ./x.js for ./x.ts).
2. Switch relative imports in backend/src and backend/tests from .js to .ts.
3. dev -> node --watch --env-file-if-exists=.env.local src/index.ts; test -> node --test with the same glob.
4. pnpm --filter backend remove tsx.
5. scripts/verify-setup.mjs: start the dev server with node instead of pnpm exec tsx.
6. Docs: engineering-practices.md test-runner bullet, local-setup.md backend test line.
7. Verify: tests, build + run dist, lint, Docker build + /health, verify-setup backend check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified on Node 24.21: 13/13 tests via `node --test` default discovery (switched from a quoted glob, which silently matched nothing under cmd.exe on Windows); tsc emits ./x.js in dist and dist serves /health; `node src/index.ts` serves /health; --watch restarts on dependency change; lint clean; verify-setup 11/11. Docker not available locally, so AC #3 (image serves /health) rests on the PR build job plus main's post-deploy smoke test.
tsx and esbuild remain in pnpm-lock.yaml only as stale resolutions of Vite's optional peers: a from-scratch resolve drops both (Vite 8 needs neither), but --fix-lockfile, dedupe, update and remove/re-add all keep them, and a full regeneration bumps unrelated versions. Left for the next lockfile regeneration; at that point allowBuilds' esbuild entry becomes stale.
The lockfile also dropped stale @google-cloud/firestore/firebase-admin peer suffixes on genkit entries (leftovers from TASK-13's ignoredOptionalDependencies).
Adversarial review: no blockers; both should-fixes applied. Open: verify-setup.mjs only checks Node is present, and without tsx, Node <22.18 now fails with ERR_UNKNOWN_FILE_EXTENSION.

Lockfile regenerated from scratch (its own commit): pnpm restores the lockfile from node_modules/.pnpm/lock.yaml, so node_modules had to be removed too. tsx and esbuild are gone (984 -> 955 packages); in-range bumps: hono 4.13.8, biome 2.5.14 (biome.json $schema bumped), jsdom 30.1.1, @types/node 24.13.6, cn 0.3.3. allowBuilds esbuild entry removed. Lint, 13/13 backend, 18/18 frontend, both builds, mermaid pass.
verify-setup.mjs now fails when the running Node major is below engines.node (checked both ways: passes on 24.21; with engines temporarily at >=99 it reports "Node 24.21.0 is older than engines.node").

PR #35 review: went back to an explicit glob, `node --test "tests/**/*.test.ts"`, so the script shows where tests live and default discovery can't later pick up a co-located src/*.test.ts plus its dist/ copy. Double quotes (not single) so cmd.exe strips them and Node still gets the glob on native Windows. Verified on Node 24.21: 13/13; narrowing to tests/routes runs 5, confirming Node applies the glob; a non-matching glob exits 0 with zero tests, which is why the quoting matters.

Closure check (2026-09-28): AC #3 observed on main: Deploy Backend run 36046598515 (6c933b1, #35) built and pushed the image, deployed it, and passed 'Smoke-test /health on the deployed service'. On main, backend dev/test run on plain node; tsconfig has erasableSyntaxOnly, verbatimModuleSyntax and rewriteRelativeImportExtensions; pnpm-lock.yaml has no tsx or esbuild package entries (the only 'tsx' left is in vite@8.3.0's optional peerDependencies declaration). DoD #2: architectural review not needed (dev tooling only; no contract, topology or deploy-target change).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Backend dev and test now run TypeScript directly on Node 24 (type stripping) instead of tsx. tsconfig rejects non-erasable syntax and needs explicit type-only imports, relative imports use .ts, and tsc rewrites them to .js in dist. The tsx/esbuild resolutions were removed with a lockfile regeneration, and verify-setup.mjs enforces engines.node. Verified with 13/13 backend tests, lint, verify-setup, and the post-merge deploy (run 36046598515), whose Docker image served /health.
<!-- SECTION:FINAL_SUMMARY:END -->
