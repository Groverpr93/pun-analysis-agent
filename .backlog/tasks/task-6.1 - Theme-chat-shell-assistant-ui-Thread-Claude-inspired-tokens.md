---
id: TASK-6.1
title: 'Theme & chat shell (assistant-ui Thread, Claude-inspired tokens)'
status: Done
assignee:
  - '@yaitorr'
created_date: '2026-09-17 23:33'
updated_date: '2026-10-04 20:57'
due_date: '2026-09-21'
labels: []
milestone: m-1
dependencies: []
references:
  - docs/design/frontend-design.md
parent_task_id: TASK-6
project: frontend
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Starts from assistant-ui's default Tailwind/shadcn Thread theme and tunes it toward the Claude-inspired palette/typography/layout in docs/design/frontend-design.md's 'Visual design' section, plus the greeting-to-chat transition described in its 'Major components > Chat' section.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 assistant-ui's pre-styled Thread component renders the chat surface with no custom semantic CSS layer
- [x] #2 Greeting state (centered, generous negative space, prominent input) transitions to the docked chat-input layout once the first message is sent
- [x] #3 Palette (warm neutral base, single restrained accent), typography, and layout match docs/design/frontend-design.md's Visual design section, in both light and dark mode
- [x] #4 Header is logo + team name only, no toolbar
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Scaffolded via `npx shadcn` (base UI + nova preset, Tailwind v4): `src/components/assistant-ui/elements/thread.aui.tsx` is assistant-ui's real pre-styled `Thread` -- it already implements the greeting ("How can I help you today?", centered, generous space) -> docked chat-input transition internally (`isNewChatView`/`ThreadPrimitive`), so AC#1/#2 come from using it as-is with no custom semantic CSS layer, just Tailwind theme tokens.
2. Remove starter-template cruft: old App.tsx/App.css content, vite/react demo assets, and the old purple/off-white starter `:root` palette in index.css that shadcn's init merged variables into (conflicting `--accent`/`--border` meanings) -- rebuild index.css cleanly from shadcn's generated CSS-variable block.
3. Retune the shadcn/nova CSS variables (`--background`, `--foreground`, `--card`, `--accent`, `--border`, `--muted`, radii, font) toward frontend-design.md's Visual design section: warm neutral base (off-white light / warm dark gray dark), a single restrained accent in the Boilermaker Gold family (muted, not literal #CFB991) used only for primary actions/active states, weight/opacity-driven text hierarchy, generous line-height. Keep shadcn's class-based `.dark` strategy but drive it automatically off `prefers-color-scheme` (no manual toggle, since the design doc doesn't ask for one) via a small effect in main.tsx.
4. Build `AppHeader` (logo mark + "Pun Agent" wordmark + sidebar trigger only, no toolbar) per AC#4, and compose `App.tsx` as `AssistantRuntimeProvider > TooltipProvider > SidebarProvider > (ThreadListSidebar [restyled: our branding, not assistant-ui's/GitHub's] + SidebarInset > AppHeader + Thread)`.
5. Verify AC#3 in both color schemes by rendering the dev server and checking contrast/spacing manually (per CLAUDE.md's "verify rendered output" rule), not just a passing build.
6. Component tests (shared App.test.tsx with TASK-6.2/6.3): greeting state renders centered with prominent input; sending a message docks the composer and shows the transcript; header shows only logo+name (no extra toolbar buttons) in both states.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scaffolded via npx shadcn (Base UI + nova preset, Tailwind v4): added tailwindcss/@tailwindcss/vite, @/* path alias, and the @assistant-ui/thread + @assistant-ui/threadlist-sidebar registry elements. Fixed a real vendored-file bug (tooltip-icon-button.tsx passed Radix's `delayDuration` prop to Base UI's TooltipProvider, which only accepts `delay` -- broke `tsc -b`). Excluded src/components/ui/** and src/components/assistant-ui/elements/** from Biome's linter (vendored/regeneratable, not hand-maintained) via a biome.json override; enabled `css.parser.tailwindDirectives` for @apply support.

Removed starter-template cruft (App.css, vite/react demo assets, old purple starter palette) and rebuilt index.css's :root/.dark blocks with a warm-neutral + muted Boilermaker-gold theme (oklch tokens), mapped onto shadcn's existing --background/--foreground/--primary/etc. tokens directly -- no separate custom CSS layer. Dark mode is driven automatically off prefers-color-scheme (src/lib/theme/sync-color-scheme.ts), no manual toggle. Re-branded the sidebar header (removed assistant-ui's own wordmark + GitHub footer link, which had no business shipping in this product) and added AppHeader (logo mark + "Pun Agent", sidebar trigger only, no toolbar).

Verified rendered output directly (not just a passing build), per CLAUDE.md: used Playwright against the running dev server to screenshot and interact with the app in both light and dark mode -- greeting state, chat transition, tool-call rendering, thread-list accumulation, and the error state all confirmed visually, plus zero browser console errors.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
assistant-ui's pre-styled Thread (from the shadcn registry) renders the chat surface as-is; theming stays within shadcn/assistant-ui's own CSS variables (index.css :root/.dark), no separate custom semantic CSS layer added. Rebuilt the palette toward a warm-neutral base with a single muted Boilermaker-gold --primary accent, in both light and dark mode (auto-driven by prefers-color-scheme, no manual toggle). AppHeader is logo mark + 'Pun Agent' + sidebar trigger only (verified: exactly 1 button in the header via a component test). Verified rendered output directly per CLAUDE.md: Playwright screenshots of the running dev server in both color schemes show the greeting state, the docked chat transition after sending a message, and the header/sidebar branding, with zero browser console errors.
<!-- SECTION:FINAL_SUMMARY:END -->
