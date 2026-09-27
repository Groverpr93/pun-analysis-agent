---
id: TASK-36
title: 'Frontend: highlight only JSON/JSON5 and silence the Vite chunk-size warning'
status: In Progress
assignee:
  - '@yaisiel.torres'
created_date: '2026-09-27 20:18'
updated_date: '2026-09-27 20:40'
labels:
  - frontend
dependencies: []
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Deploy Frontend build warns that chunks exceed 500 kB (https://github.com/team-play/pun-analysis-agent/actions/runs/36346835474/job/108697676537). Two causes: (1) the full Shiki bundle emits ~300 lazy grammar chunks, including cpp/emacs-lisp at ~790 kB, plus the Oniguruma WASM engine (622 kB, 232 kB gzip) that every visitor downloads on their first code block; (2) the main index chunk is ~1.1 MB and was already over the limit before TASK-10, made up almost entirely of first-paint dependencies (assistant-ui, react-dom, base-ui). A pun analyzer rarely emits code other than JSON/JSON5, so highlighting only those languages is an acceptable product trade-off; other languages render as plain code. Vendor chunk splitting was considered and rejected: it does not reduce first-load bytes (~339 kB gzip either way), and a catch-all vendor group pulled every lazy grammar into one eager 10 MB chunk.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 JSON and JSON5 code blocks are syntax-highlighted with the site palette, including JSONC fences and upper-case fence names
- [ ] #2 Code blocks in any other language render as plain code without errors
- [ ] #3 The production build emits no Shiki grammar chunks other than JSON/JSON5, and no WASM engine is fetched at runtime (react-shiki still emits an unreachable Oniguruma WASM chunk)
- [ ] #4 The build no longer prints the chunk-size warning, and the limit still catches meaningful growth of the main chunk
- [ ] #5 Tests fail if JSON5 highlighting, language aliases, the plain-code fallback for other languages, or the fallback when the highlighter fails to load regresses
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New module builds a fine-grained Shiki core highlighter: JSON + JSON5 grammars (shiki/langs/*.mjs dynamic imports), the purdue CSS-variables theme, and the JavaScript regex engine instead of Oniguruma WASM.
2. lazy-shiki-highlighter awaits that highlighter inside the existing React.lazy loader, so creation failures reuse the plain-code fallback, and passes it to SyntaxHighlighter.
3. shiki-highlighter.tsx imports useShikiHighlighter from react-shiki/core (the root entry references every bundled grammar); drop the github-* default theme, which the core highlighter would not have loaded.
4. Tests: JSON5 is highlighted; an unloaded language (e.g. python) renders as plain code.
5. Set build.chunkSizeWarningLimit just above the main chunk with a comment explaining why; verify the build output and render JSON/JSON5 in the real app.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Build: 313 JS chunks -> 10; dist 30 MB -> 2.2 MB; index 1,106 -> 1,087 kB (gzip 338 -> 332). No chunk-size warning at chunkSizeWarningLimit 1150.
react-shiki still emits the Oniguruma WASM chunk (its named-engine table), but it is only reached when `engine` is a string and react-shiki builds the highlighter itself; verified in vite preview that the first code block fetches only shiki-highlighter.aui, engine-javascript, purdue-highlighter, json and json5 chunks.
Mutation-checked the new tests: dropping the json5 grammar fails the JSON5 test; adding a python grammar fails the plain-fallback test.

Review follow-ups: highlighter is now a required prop (react-shiki/core throws without one); langAlias maps json/json5/jsonc case-insensitively (jsonc -> json5 grammar); tests cover highlighter-creation failure and aliases (mutation-checked: empty langAlias fails JSON and jsonc); loader rewritten as async try/catch; dropped a defaultColor that is a no-op with a single theme.
<!-- SECTION:NOTES:END -->
