---
id: TASK-23
title: 'Backend: user-facing messages for /api/chat model errors'
status: Done
assignee:
  - '@yaitorr'
created_date: '2026-09-23 08:53'
updated_date: '2026-10-04 20:57'
labels: []
milestone: m-2
dependencies: []
references:
  - backend/src/routes/chat.ts
  - frontend/src/lib/chat/genkit-flow-stream.ts
  - docs/contracts.md
type: bug
project: backend
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When the Gemini call behind /api/chat fails, users see Gemini's raw developer-facing error. Found during TASK-8's live browser check: a Gemini free-tier 503 rendered in the chat's error box as 'UNAVAILABLE: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:streamGenerateContent?alt=sse: [503 Service Unavailable] This model is currently experiencing high demand...'. The error box truncates to one line, so the only helpful sentence ('try again later') is cut off, while the internal API URL, provider and model name stay visible. The full upstream payload also sits in the error event's details, where anyone can see it in devtools.

Why it happens: routes/chat.ts runs failures through genkit/context's getCallableJSON. That function only genericizes errors that aren't GenkitErrors, and upstream model failures are GenkitErrors, so their message and details pass through unchanged. Scoped to Backend deliberately: Backend is the only domain that knows it's talking to Gemini, and Frontend consumes the /api/chat contract only (docs/design/frontend-design.md), so Frontend shouldn't learn Gemini's error vocabulary.

Context for whoever picks this up: (1) Frontend's genkit-flow-stream.ts renders errors as '${status}: ${message}', so the status code prefix will still show. Changing that is Frontend work and out of scope here. (2) backend/tests has a wire-format parity test against @genkit-ai/express's real handler for the error path; the event's shape must stay Genkit's, even if the test's expected message changes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When the model call fails (at least Gemini 503 UNAVAILABLE, 429 RESOURCE_EXHAUSTED, and an invalid API key), the error event's message is a short user-facing sentence with no upstream URL, provider/model name, or raw upstream payload
- [x] #2 The error event keeps Genkit's {error: {status, message}} wire shape and the original Genkit status code, with no upstream payload in details, so Frontend's adapter parsing needs no change
- [x] #3 The full upstream error is still logged server-side for debugging
- [x] #4 Backend tests cover the mapped messages for at least two failure statuses using the Genkit test-double model, with no live Gemini call
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. routes/chat.ts catch block: if the client disconnected (request signal aborted), return without logging or writing. Otherwise log the original error plus GenkitError.detail via Genkit's logger, then write {error: {status, message}}: status is the GenkitError's own status (INTERNAL for anything else), message comes from a status -> user-facing sentence map (UNAVAILABLE/DEADLINE_EXCEEDED -> busy, RESOURCE_EXHAUSTED -> usage limit) with a neutral fallback. No details on the wire.
2. Statuses checked against @genkit-ai/google-genai 1.42.0 on both of its paths: pre-stream HTTP errors (client.mjs switch: 429 RESOURCE_EXHAUSTED, 400 INVALID_ARGUMENT, 503 UNAVAILABLE, 500 INTERNAL, else UNKNOWN) and mid-stream errors (Google's own status string, e.g. DEADLINE_EXCEEDED).
3. Tests in tests/routes/chat.test.ts using mockModel with GenkitErrors shaped like the plugin's: exact {status, message} for 503/504/429/400/non-Genkit; no upstream text on the wire; original error + detail logged; client disconnect neither logs nor sends an error.
4. Wire-format parity test: the error path compares framing + keys + status for a plain Error (not bytes). GenkitErrors can't be compared there: @genkit-ai/express's exports map puts 'default' before 'import', so it loads its CJS build with a different GenkitError class.
5. contracts.md: new 'Failed replies' subsection (error event shape, message is user-facing, status is diagnostic, Phase 2 pending-tool-call note, disconnects get no event).
6. Verify with a real invalid-key failure; code review + architectural review (contracts.md changed).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Real failure check (backend with an invalid Gemini key, curl): wire = error: {"error":{"status":"INVALID_ARGUMENT","message":"Something went wrong. Please try again."}}; server log has '/api/chat flow failed' with the full GenkitError (API_KEY_INVALID reason, stack). Gemini failures are also logged by @genkit-ai/google-genai's own client (client.mjs logger.error(e)); kept ours anyway since that's plugin-internal and doesn't cover non-fetch failures. Code review (high) + architectural review (no blockers). Fixed: abort/disconnect logged as error, detail missing from logs, DEADLINE_EXCEEDED wording, fallback no longer claims 'on our end' (covers safety-blocked replies), noisy test output, parity test for GenkitErrors (found and documented the @genkit-ai/express CJS dual-package hazard instead), contracts.md wording/placement + Phase 2 pending-tool-call note. Not acted on: pass through Genkit UserFacingError messages (nothing throws one yet; worth revisiting in TASK-9), double logging (above). Handed to TASK-24: frontend's recordedErrorStream fixture shows the old leaky event and should be re-recorded. Mutation-checked: removing the logging line or the abort guard fails the matching test. 20/20 backend tests, tsc, biome clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Backend's /api/chat error event now carries Genkit's status plus a user-facing message (busy / usage limit / neutral fallback) instead of Gemini's raw error text and details; the original error and its detail are logged server-side, and client disconnects are neither logged as failures nor answered with an error event. contracts.md gains a 'Failed replies' subsection making 'message is safe to display' a cross-domain guarantee. Verified with 20 backend tests (mock-model GenkitErrors for 503/504/429/400/non-Genkit, logging, disconnect), mutation checks, and a real invalid-key failure against the running backend; code review and architectural review both done.
<!-- SECTION:FINAL_SUMMARY:END -->
