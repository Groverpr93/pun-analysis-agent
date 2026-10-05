---
id: TASK-22
title: Rebrand frontend with otter mascot and pun-analyzer copy
status: Done
assignee:
  - '@yaitorr'
created_date: '2026-09-20 11:46'
updated_date: '2026-10-04 20:57'
labels: []
milestone: m-1
dependencies:
  - TASK-6
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The chat UI currently ships with generic placeholder branding (a lucide MessagesSquare icon, a purple abstract favicon.svg unrelated to the project, and neutral copy like 'How can I help you today?' / 'Send a message...'). The team has an otter mascot (Purdue black/gold, glasses, hoodie) established for this project and a 'That's punny!' catchphrase, but neither the visual identity nor the copy currently reflects that the app is specifically a conversational pun-analysis agent (per docs/project-spec.md), not a general-purpose chat UI. This task aligns the deployed Slice 1 UI (from TASK-6) with the team's actual branding and the spec's subject matter before it's demoed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 favicon.svg and any header/sidebar iconography use an otter-mascot-derived design instead of the generic purple mark or lucide MessagesSquare icon
- [x] #2 New artwork is authored as inline/embeddable SVG (no added raster image dependencies), consistent with the repo's existing web-first asset approach
- [x] #3 Welcome message, composer placeholder, and page title read as pun-analysis-specific copy with light, non-overbearing pun usage, and no longer read as a generic chatbot
- [x] #4 Existing App.test.tsx assertions are updated to match the revised copy and the full frontend test suite (pnpm test) and lint (pnpm lint) pass
- [x] #5 Visual design remains cohesive with the existing Claude-inspired/Purdue-gold theme from TASK-6.1 rather than clashing with it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a reusable inline-SVG OtterMark icon component (frontend/src/components/icons/otter-mark.tsx) capturing the mascot's face (glasses, ears, whiskers) in the existing Purdue black/gold theme tokens.
2. Replace frontend/public/favicon.svg (and index.html reference) with an otter-mascot favicon derived from the same design.
3. Swap the generic lucide MessagesSquare icon for OtterMark in app-header.tsx and threadlist-sidebar.aui.tsx.
4. Revise copy: index.html <title> and a meta description, the ThreadWelcome message and composer placeholder in thread.aui.tsx, keeping puns light per the requirement.
5. Update frontend/src/App.test.tsx assertions to match the new copy strings.
6. Run pnpm --dir frontend lint, test, and build to verify; visually spot check via the dev server.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added OtterMark (frontend/src/components/icons/otter-mark.tsx), an inline lucide-style SVG (currentColor, no raster assets) reused in app-header.tsx and threadlist-sidebar.aui.tsx in place of lucide's MessagesSquare. Replaced frontend/public/favicon.svg with a standalone otter-face SVG in the same black/Boilermaker-gold/tan palette as the theme's --primary token. Revised copy: ThreadWelcome to 'Got a pun for me?' and the composer placeholder to "Type a phrase and I'll sniff out the pun..." (thread.aui.tsx), plus an SEO meta description in index.html; kept the 'Pun Agent' title/brand and localStorage key prefix as-is to avoid an unrelated rename. Updated App.test.tsx's matching string assertions.

Verified: pnpm --dir frontend lint (biome check, clean), pnpm --dir frontend test (18/18 passing), pnpm --dir frontend build (succeeds). Manually exercised the running dev server in the browser pane: header/sidebar render the otter mark, greeting shows 'Got a pun for me?', composer placeholder shows the new copy, and sending a pun-triggering message still renders the analyze_pun tool-call fixture end-to-end correctly.

Follow-up (same session): added a sidebar footer credit line ('Made with 🦦tter love by Team PLAY (CNIT-58100)') via SidebarFooter in threadlist-sidebar.aui.tsx, per user request to credit the team similarly to other apps' 'made by' footers. Re-verified pnpm --dir frontend lint/test (18/18) and visually confirmed rendering in the browser pane.

Follow-up (same session): added a social share card. Composited the team's actual circular mascot logo (source: the team-provided 1254x1254 logo artwork, alpha-masked to a clean circle) with 'Pun Agent' title/tagline/Team PLAY byline into a 1200x630 og-image.jpg (frontend/public/og-image.jpg), and wired up og:*/twitter:* meta tags in index.html pointing at it (canonical URL https://pun-agent.web.app/, matching frontend/.firebaserc's 'pun-agent' project). Re-verified pnpm --dir frontend lint/test/build all pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced the generic MessagesSquare icon and unrelated purple favicon with an inline-SVG otter mascot (header, sidebar, favicon), and revised the greeting/placeholder/meta copy to read as a pun-analysis agent with light pun usage, while keeping the existing Purdue-gold theme and the 'Pun Agent' brand name intact. Verified via lint/test/build plus a manual browser walkthrough of the greeting state and the Phase 2 tool-call fixture.
<!-- SECTION:FINAL_SUMMARY:END -->
