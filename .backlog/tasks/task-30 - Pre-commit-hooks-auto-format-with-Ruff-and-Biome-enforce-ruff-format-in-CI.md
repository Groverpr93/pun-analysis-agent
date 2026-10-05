---
id: TASK-30
title: 'Pre-commit hooks: auto-format with Ruff and Biome; enforce ruff format in CI'
status: Done
assignee:
  - '@yaitorr'
created_date: '2026-09-26 19:09'
updated_date: '2026-10-04 20:57'
labels: []
dependencies: []
references:
  - lefthook.yml
  - .github/workflows/lint.yml
  - scripts/verify-setup.mjs
  - pnpm-workspace.yaml
type: chore
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Formatting is only enforced after the fact: CI runs `biome check` for JS/TS and `ruff check` (lint only) for Python, so nothing formats at commit time and nothing checks Python formatting at all — inference/candidates.py has already drifted from `ruff format`. Lefthook was chosen over the pre-commit framework so hooks run the lockfile-pinned Biome (node_modules) and per-package Ruff (uv.lock) instead of a second pinned copy that can drift from CI.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A `pnpm install` on a dev machine installs a git pre-commit hook without any extra manual step
- [x] #2 Committing staged JS/TS/JSON/CSS runs `biome check --write` on just those files and re-stages the fixes
- [x] #3 Committing staged Python in inference/ or eval/ runs `ruff check --fix` then `ruff format` with that package's locked Ruff and config, and re-stages the fixes
- [x] #4 An unfixable lint error blocks the commit with the tool's message
- [x] #5 CI (lint.yml) and scripts/verify-setup.mjs fail when inference/ or eval/ is not `ruff format`-clean, and both packages currently pass
- [x] #6 `pnpm install --frozen-lockfile --filter backend` in the backend Docker build still succeeds
- [x] #7 Unstaged hunks of a partially staged file are never committed, and are restored unchanged unless they sit next to lines the formatter rewrites, where they can come back shifted; this caveat is documented in docs/local-setup.md
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add lefthook as a root devDependency; allow its postinstall in pnpm-workspace.yaml allowBuilds (not a root prepare script, which would run in the backend Docker build that has no .git).
2. lefthook.yml: parallel pre-commit jobs — biome check --write on {staged_files} (Biome's documented recipe), and per-package ruff check --fix && ruff format with root: inference/ and eval/; stage_fixed on all.
3. Add ruff format --check to lint.yml lint-python and to scripts/verify-setup.mjs; ruff format inference/candidates.py.
4. Verify: hook installed, fixes re-staged, partial staging preserved, unfixable lint blocks, md-only commit passes, Docker filter install unaffected.
5. Separate docs commit: local-setup.md, agent-setup.md, README if relevant.

6. After review: call node_modules/.bin/biome directly (pnpm exec can run an install mid-commit); Python jobs in a piped group behind a "uv installed" check with fail_text (user chose fail-with-explanation over skipping when uv is missing); skip: [merge, rebase] at hook level.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented lefthook 2.1.14 + lefthook.yml; ruff format --check added to lint.yml and verify-setup.mjs; candidates.py reformatted.
Verified in a throwaway worktree: TS + Python fixes re-staged into the commit; unfixable ruff error (undefined name) blocks the commit; md-only commit passes; branch without lefthook.yml (main) exits 0 through the shared hook.
Partial staging: unstaged hunks away from reformatted lines are preserved exactly. Known limitation: an unstaged hunk adjacent to lines the formatter rewrites is re-applied at a shifted position (no content loss, nothing unstaged committed, no warning from lefthook).
Docker path: `pnpm install --frozen-lockfile --filter backend` without .git still installs root devDeps incl. lefthook; its postinstall prints a git error (exit 128) but the install exits 0 — a root prepare script would have failed here.

Code review + architectural review (subagents) done. Confirmed OK: package-relative paths and nested files under root, renames/deletes/spaces, frontend/public excluded like CI, single mutex-guarded git add for stage_fixed, && works on Windows (lefthook runs sh -c). Fixed: pnpm exec -> direct biome binary; pnpm-workspace.yaml comment accuracy; clarified lefthook.yml comments. Architectural: hook couples commits to both toolchains — per user, a missing uv now fails with an explanation; documented in local-setup.md. Deploy/perf: lefthook is a root devDep, absent from the backend runtime image (pnpm deploy --prod); CI installs set CI=true so the postinstall no-ops.
Re-verified in an isolated repo: uv missing -> blocked with fail_text, Ruff jobs skipped; uv present -> fixed + re-staged; md-only -> Python group skipped; merge -> whole hook skipped. The implementation commit itself ran through the hook.
Open: AC #4 only holds when unstaged hunks are not adjacent to reformatted lines (documented caveat in local-setup.md). AC #6 verified locally (ruff format --check passes in both packages; verify-setup.mjs change); still needs a CI run on the PR.

AC #4 (partial staging) replaced with #7, reworded to match the documented caveat at the user's request. Evidence: throwaway-worktree tests — unstaged hunk far from reformatted lines restored exactly; adjacent one restored shifted (TAIL = 1 moved above def h); neither committed. Remaining: AC #5 needs the PR's CI run.

AC #5: PR #43 CI (run 36267298842) ran `uv run ruff format --check .` in both Ruff jobs — "5 files already formatted" each, all 8 checks passing. Failing case is the same command that rejected inference/candidates.py locally before it was reformatted. AC #6 also confirmed on the real Dockerfile: PR #43's "Build image" job passed with lefthook in the lockfile.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a Lefthook pre-commit hook (lefthook.yml) that runs `biome check --write` on staged JS/TS/JSON/CSS and `ruff check --fix` + `ruff format` on staged Python in inference/ and eval/, using the lockfile-pinned tools and re-staging fixes. It installs via lefthook's postinstall on `pnpm install` (allowBuilds, not a prepare script, so the git-less backend Docker build keeps working), fails with an explanation when uv is missing, and skips merges/rebases. CI (lint.yml) and verify-setup.mjs now also run `ruff format --check`; inference/candidates.py was reformatted. Docs updated in a separate commit (local-setup.md "Pre-commit hook" section plus README, agent-setup.md, engineering-practices.md, setup-local-env skill).
Verified: throwaway-worktree tests (fixes re-staged, unfixable lint blocks, md-only passes, merge skipped, missing uv blocked with message, partial-staging caveat documented), git-less `pnpm install --filter backend` exits 0, and PR #43 CI green with the new format step reporting "5 files already formatted" in both packages. Code and architectural reviews done by subagents; findings fixed or noted.
<!-- SECTION:FINAL_SUMMARY:END -->
