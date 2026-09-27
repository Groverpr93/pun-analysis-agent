---
id: TASK-29
title: 'Backend: structured logs on Cloud Run, one entry per event with a severity'
status: In Progress
assignee:
  - '@yaisiel.torres'
created_date: '2026-09-26 13:45'
updated_date: '2026-09-27 15:06'
labels: []
dependencies: []
references:
  - backend/src/routes/chat.ts
  - backend/src/middleware/app-check.ts
  - backend/src/app.ts
type: bug
project: backend
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seen while verifying TASK-25's deploy (2026-09-26): in the pun-agent-backend Cloud Run logs, a single failed /api/chat (Gemini 503) shows up as dozens of separate entries, one per line of the pretty-printed error object and stack trace, with no severity. Earlier logger.warn calls appear as WARNING entries with an empty message. So errors are hard to find or filter in Logs Explorer, and severity-based alerting can't work.

Backend logs through Genkit's logger (genkit/logging): routes/chat.ts (logger.error on flow failures, with the upstream detail), middleware/app-check.ts (logger.warn on App Check rejections, with the reason), and app.ts (the APP_CHECK=off warning). Cloud Run treats each stdout/stderr line as its own entry unless the line is a single JSON object, whose severity and message fields it maps to the entry's severity and message.

Keep what those calls deliberately log server-side only: the upstream error detail (TASK-23) and the App Check rejection reason (TASK-25). Local pnpm dev output should stay readable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On Cloud Run, each logger call produces exactly one log entry, including errors with a stack trace
- [ ] #2 Each entry has the right severity (WARNING for App Check rejections and the APP_CHECK=off warning, ERROR for flow failures), and its message is the log call's message
- [ ] #3 Flow-failure entries still include the upstream error detail and the stack trace; App Check rejection entries still include the reason
- [ ] #4 Local pnpm dev logs stay human-readable
- [ ] #5 Tests cover the log format without needing Cloud Run or the network
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Root cause: genkit/logging's default sink is console.* with (message, metadata) args; Node pretty-prints the metadata object across many lines, and Cloud Run turns each line into its own entry with no severity.
2. Add backend/src/logging.ts: a Cloud Run sink for Genkit's pluggable logger (logger.init) that writes one JSON line per call with severity + message, and the call's metadata (detail, exception.*) as jsonPayload fields. The write function is injected so tests can capture lines.
3. Install it only on Cloud Run (K_SERVICE, same signal config.ts already uses); locally Genkit's default console sink stays, so pnpm dev output is unchanged. Install before app.ts evaluates so the APP_CHECK=off warning goes through it too.
4. Tests (node:test, no network): severity mapping per level, one line per call even with a stack trace, message/detail/stacktrace preserved, a metadata key can't overwrite severity/message, unserializable metadata doesn't throw; plus a test that the logger calls in chat.ts and app-check.ts come out correctly through the sink.
5. No new dependency (not @genkit-ai/google-cloud: Winston + Cloud Logging API client is heavy cold-start cost for what stdout JSON already does).
6. Code review subagent; docs drift check.

Revised (with Yai): the JSON sink is selected by an explicit LOG_FORMAT=json (strict: unset=console, anything else refuses to start), set by ENV in backend/Dockerfile, rather than detected from K_SERVICE.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented backend/src/logging.ts (toLogLine + createJsonLogSink for Genkit's logger.init), LOG_FORMAT in config.ts, ENV LOG_FORMAT=json in backend/Dockerfile, install in app.ts; index.ts startup message now goes through logger.info. Tests: tests/logging.test.ts (severity per level, one line with stack, metadata can't spoof severity/message, per-field inspect fallback for circular/BigInt, level filtering, App Check and /api/chat paths end to end, and app.ts in a child process for both formats); LOG_FORMAT cases in tests/config.test.ts. 56/56 pass; mutation-checked the wiring test. Verified locally against real stdout: JSON mode prints one WARNING/INFO line per call, console mode unchanged, LOG_FORMAT=JSON refuses to start. Code review subagent done; acted on: wiring test, per-field fallback, type guard, comments. Not done (possible follow-up): Error Reporting ingestion (would need a stack_trace field). ACs #1-#3 still to confirm in the deployed service's Logs Explorer after merge.

Error Reporting: per Google's docs it scans all jsonPayload fields for a stack trace at any severity (outside App Engine standard), so flow failures should reach it via exception.stacktrace with no stack_trace field. To keep App Check rejections (WARNINGs from junk tokens on the public URL) out of it, app-check.ts now logs {reason: err.message} instead of the Error, so no stack. Post-deploy check: flow failures appear in Error Reporting, App Check rejections don't.
<!-- SECTION:NOTES:END -->
