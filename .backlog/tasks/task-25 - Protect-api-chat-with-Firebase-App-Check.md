---
id: TASK-25
title: Protect /api/chat with Firebase App Check
status: Done
assignee:
  - '@yaitorr'
created_date: '2026-09-23 09:50'
updated_date: '2026-10-04 20:57'
labels: []
dependencies:
  - TASK-13
references:
  - docs/contracts.md
  - backend/src/app.ts
  - frontend/src/lib/chat/live-chat-model-adapter.ts
type: feature
project: backend
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Once TASK-13 deploys Backend to Cloud Run, /api/chat is a public URL that spends the team's Gemini quota for any caller. The Gemini key sits server-side (that's the point of the proxy), so callers don't need one. CORS only restrains browsers, and the Cloud Run service has to allow unauthenticated calls so the Firebase-hosted app can reach it. So anyone who finds the *.run.app URL (visible in the frontend's network requests) can drive Gemini usage until quota runs out and real users get the 'usage limit' error. Decided during TASK-13 planning (2026-09-23) to handle this as its own task: TASK-13 only bounds the damage (Cloud Run instance caps; a Gemini key in a project without billing, so Google's free-tier limits cap usage rather than billing it).

Firebase App Check makes Backend accept only requests carrying a token that attests they came from our Firebase-hosted app (reCAPTCHA-based attestation on web). It spans both domains: Frontend obtains the token (Firebase JS SDK) and sends it with each /api/chat request; Backend verifies it (firebase-admin) before running the flow. Both are new dependencies, which affects bundle size and Cloud Run cold start (AGENTS.md's Performance section), and the request header becomes part of the /api/chat contract, so this needs an architectural review. It may be worth splitting into Backend and Frontend tasks when picked up, as TASK-23/TASK-24 were.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Backend rejects /api/chat requests without a valid App Check token before invoking the flow, so they never reach Gemini
- [x] #2 The deployed frontend attaches a valid App Check token to every /api/chat request, and a real conversation still completes end-to-end
- [x] #3 Local dev and CI keep working without real attestation (e.g. App Check debug tokens or a documented off switch), per docs/engineering-practices.md's isolation rule
- [x] #4 docs/contracts.md documents the App Check header on /api/chat
- [x] #5 Accept/reject behavior is covered by tests that need no network or real tokens (verifier injected or mocked)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Decisions (2026-09-24, with @yaisiel.torres): one PR stacked on #37 (TASK-8 live frontend); attestation = reCAPTCHA Enterprise; Backend verifies with firebase-admin (existing tooling; image is <100MB today, delta to be measured).

1. Backend, test-first: Hono middleware on /api/chat only, taking an injected verifier (like createChatHandler takes its flow). Missing/invalid/expired token -> one uniform 401 {"error": "Unauthorized"} before the flow runs; the real reason is logged server-side only. Tests: missing header, verifier rejects, verifier accepts, flow never invoked on reject, CORS preflight allows X-Firebase-AppCheck.
2. Backend wiring: real verifier = firebase-admin getAppCheck().verifyToken, initialized lazily. Enforcement is fail-closed; local dev without a token needs an explicit, logged opt-out (decide exact form while implementing). Confirm how firebase-admin finds the project on Cloud Run.
3. Frontend: firebase app + app-check (modular imports only), ReCaptchaEnterpriseProvider with auto-refresh, loaded only on the live adapter path so stub builds/tests never load it. Live adapter gets an injected token getter and sends X-Firebase-AppCheck; token failure shows the existing user-facing no-reply message. Dev uses the App Check debug provider.
4. deploy-frontend.yml: public Firebase config + reCAPTCHA site key as build env. deploy-backend.yml: whatever project config firebase-admin needs.
5. Docs: contracts.md (header + 401), local-setup.md (console setup, debug token), engineering-practices.md isolation notes if affected.
6. Measure backend image size before/after firebase-admin.
7. Code review + architectural review subagents (contract change + new deps).
8. Notes: accepted deploy-order window (backend may enforce before the new frontend is live; minutes; old open tabs fail until reload); replay within token TTL not prevented (limited-use tokens + consume would cost a Google call per request).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Exposure widened (2026-09-24, TASK-8 architectural review): the deployed site now builds with VITE_CHAT_ADAPTER=live, so the public UI itself spends Gemini quota; nobody needs to find the run.app URL first. That quota (AI Studio project gen-lang-client-0125403786, free tier) is shared with the team's local-dev keys, so draining it also breaks local development. TASK-13's caps (max 1 instance, billing-off key) still bound the damage to quota, never cost. Worth considering a higher priority.

Backend slice committed (8e9f0ae): appCheck middleware (injected verifier, uniform 401, reason logged), firebase-admin verifier with explicit projectId (verified locally: no credentials needed; forged token with right iss/aud rejected on unknown kid after fetching Google's JWKS), fail-closed APP_CHECK=off opt-out. hono/cors already reflects requested headers, so X-Firebase-AppCheck preflights pass unchanged (regression test added). firebase-admin's optional @google-cloud/firestore and @google-cloud/storage added to ignoredOptionalDependencies: prod node_modules 186MB -> 228MB (vs 291MB with them). @firebase/util postinstall disallowed (App Hosting web-config auto-init, unused).

Review follow-ups and decisions (2026-09-24):
- Plan step 4 changed: Firebase web config + reCAPTCHA site key are committed constants in frontend/src/lib/firebase/app-check.ts (public, same in every environment, mirrors backend's firebaseProjectId), not deploy-frontend.yml env.
- Code review fixes: token wait now ends on the user's stop or after 10s (a blocked reCAPTCHA script left runs hanging); removed a backend test that couldn't fail; app.test.ts clears APP_CHECK before importing the app; startAppCheck tested.
- Architectural review fixes: middleware covers /api/*; deploy-backend.yml smoke-tests a 401 for a token-less POST /api/chat (invalid body, never reaches Gemini; checked locally: 401 enforced, 400 off); config.ts refuses to start with APP_CHECK=off when K_SERVICE is set (Cloud Run); project-ID coupling documented both ways.
- Local live-mode dev: team shares one registered debug token via 1Password (from @yaisiel.torres); APP_CHECK=off only helps non-browser callers.
- Dropped: 401-specific 'reload the page' message. Already-open tabs and anyone loading before the new frontend deploys run the old bundle, so it can't help the deploy window.
- Accepted risks: (1) deploy-order window: backend and frontend deploy concurrently on merge; if the backend lands first, the site 401s for minutes, and open tabs fail until reload. (2) A token can be replayed until it expires (1h); limited-use tokens + consume would add a Google call per request. (3) reCAPTCHA Enterprise usage on the billed pun-agent project: free tier judged sufficient by @yaisiel.torres. (4) Tokens identify the project, not which web app in it.

Validation (2026-09-24): backend 37/37 node:test, frontend 62/62 Vitest, tsc (both) and Biome clean. AC #1: middleware tests (route never reached on reject) + real-app 401 test; real firebase-admin verifier rejected malformed and forged tokens locally. AC #3: @yaisiel.torres ran pnpm dev live mode with the shared debug token against a local Backend enforcing App Check, and a real conversation completed; CI tests use injected/mocked verifiers. AC #4: contracts.md. AC #5: injected verifier / mocked token getter and Firebase SDK. AC #2 pending: check after #37 and this PR deploy.

Post-deploy verification (2026-09-26, merge 50e089c): Deploy Backend (run 36245664866) and Deploy Frontend (run 36245664862) succeeded; the new smoke step (token-less POST /api/chat -> 401) passed. Live backend: 401 {"error":"Unauthorized"} with no token and with a bogus one; preflight allows x-firebase-appcheck. On pun-agent.web.app the browser loaded reCAPTCHA Enterprise with our site key, the App Check exchange returned 200, and /api/chat returned 200 (token accepted); Claude's first attempts then hit Gemini 503 UNAVAILABLE (high demand, confirmed in Cloud Run logs), shown correctly as the 'busy' message. @yaisiel.torres then completed a real two-turn conversation on pun-agent.web.app. pun-agent.firebaseapp.com not separately exercised (same bundle, same key allowlist and CORS entry).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
/api/chat now requires a Firebase App Check token. Backend: Hono middleware on /api/* with an injected firebase-admin verifier; uniform 401 for any missing/invalid token, reason logged only; fail-closed APP_CHECK=off opt-out for local dev that refuses to start on Cloud Run (K_SERVICE). Frontend: live adapter sends X-Firebase-AppCheck from reCAPTCHA Enterprise (debug token under pnpm dev, shared via 1Password); SDK loaded only on the live path; token wait bounded by stop/10s; failed setup retried. Deploy smoke-tests the 401. contracts.md and setup docs updated. Verified by 37 backend + 64 frontend tests (no network/real tokens), mutation checks, code + architectural reviews, a local end-to-end run with the debug token, and a real conversation on the deployed site after merge (#38).
<!-- SECTION:FINAL_SUMMARY:END -->
