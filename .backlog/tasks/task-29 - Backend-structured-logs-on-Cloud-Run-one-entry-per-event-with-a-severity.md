---
id: TASK-29
title: 'Backend: structured logs on Cloud Run, one entry per event with a severity'
status: Done
assignee:
  - '@yaitorr'
created_date: '2026-09-26 13:45'
updated_date: '2026-10-04 20:57'
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
- [x] #1 On Cloud Run, each logger call produces exactly one log entry, including errors with a stack trace
- [x] #2 Each entry has the right severity (WARNING for App Check rejections and the APP_CHECK=off warning, ERROR for flow failures), and its message is the log call's message
- [x] #3 Flow-failure entries still include the upstream error detail and the stack trace; App Check rejection entries still include the reason
- [x] #4 Local pnpm dev logs stay human-readable
- [x] #5 Tests cover the log format without needing Cloud Run or the network
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [x] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [x] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
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

Follow-up (2026-09-28, with @yaisiel.torres): 7. toLogLine moves Genkit's exception.stacktrace to stack_trace on ERROR entries only, the field Error Reporting reads (probes A/B/C). WARNINGs keep exception.stacktrace, because they are handled degradation (analyze_pun Inference failures), not errors to report. 8. chat.ts comment explaining the duplicate ERROR logged by the Google AI plugin (kept by decision). 9. Tests: ERROR has stack_trace and no exception.stacktrace; WARNING keeps exception.stacktrace and has no stack_trace; both mutation-checked. 10. Review subagent; after deploy, a real flow failure shows up in Error Reporting and an analyze_pun warning doesn't.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented backend/src/logging.ts (toLogLine + createJsonLogSink for Genkit's logger.init), LOG_FORMAT in config.ts, ENV LOG_FORMAT=json in backend/Dockerfile, install in app.ts; index.ts startup message now goes through logger.info. Tests: tests/logging.test.ts (severity per level, one line with stack, metadata can't spoof severity/message, per-field inspect fallback for circular/BigInt, level filtering, App Check and /api/chat paths end to end, and app.ts in a child process for both formats); LOG_FORMAT cases in tests/config.test.ts. 56/56 pass; mutation-checked the wiring test. Verified locally against real stdout: JSON mode prints one WARNING/INFO line per call, console mode unchanged, LOG_FORMAT=JSON refuses to start. Code review subagent done; acted on: wiring test, per-field fallback, type guard, comments. Not done (possible follow-up): Error Reporting ingestion (would need a stack_trace field). ACs #1-#3 still to confirm in the deployed service's Logs Explorer after merge.

Error Reporting: per Google's docs it scans all jsonPayload fields for a stack trace at any severity (outside App Engine standard), so flow failures should reach it via exception.stacktrace with no stack_trace field. To keep App Check rejections (WARNINGs from junk tokens on the public URL) out of it, app-check.ts now logs {reason: err.message} instead of the Error, so no stack. Post-deploy check: flow failures appear in Error Reporting, App Check rejections don't.

Post-deploy check (2026-09-28), via gcloud logging read on pun-agent-backend since the 66c8629 deploy: every logger call is one entry, including errors with a stack trace. App Check rejections are WARNING and flow failures ERROR, with the call's message. Flow failures carry detail and exception.stacktrace. Warnings with no fields are stored as textPayload (Cloud Logging does this for a JSON line with only severity + message), and their severity is still read correctly. Error Reporting had 0 groups over 30 days despite 4 ERROR entries with stack traces. The Error Reporting API was not enabled; enabled it with @yaisiel.torres's approval. Probes written through entries:write with the backend's cloud_run_revision resource: A (Error: header, stack_trace field) and C (GenkitError: header, stack_trace field) were grouped within 20s. B (GenkitError: header in exception.stacktrace, our current shape) was not grouped after 5 min. So Error Reporting does not read the dotted exception.stacktrace key, despite the docs saying it searches all jsonPayload fields; the header name doesn't matter. Duplicate ERROR per Gemini failure: @genkit-ai/google-genai googleai/client.mjs logs logger.error(e) before rethrowing, then chat.ts logs it with detail. Decided with @yaisiel.torres: keep both and document it in chat.ts; skipping our stack when the plugin already logged it would need a guess or stateful dedupe tied to one line in a dependency.

Implemented follow-up (plan 7-9): logging.ts withReportableStack moves exception.stacktrace to stack_trace on ERROR entries only; the toLogLine JSDoc reserves stack_trace; the chat.ts comment documents the plugin's duplicate entry (also counted twice in Error Reporting). Tests: ERROR entries (with metadata, logged on their own in the plugin's shape, and the /api/chat path) have stack_trace; the analyze_pun WARNING keeps exception.stacktrace and has no stack_trace. Mutation-checked: applying the move at every level fails the WARNING test, and never moving it fails the ERROR tests. 100/100 backend tests pass, biome clean. Code review subagent: no blockers; applied its should-fix (double count in Error Reporting in the comment), the reserved-key JSDoc note and the plugin-shape test. Architectural review not needed (no contract, topology or dependency change). Docs: none mention these fields. Still to do after deploy: a real flow failure groups in Error Reporting, and an analyze_pun warning does not. Probe entries remain in the error-reporting-probe log and as PROBE-A/PROBE-C groups in Error Reporting.

Post-deploy (2026-09-28): #55 (2b661fd) deployed by Deploy Backend run 36402699453 as revision pun-agent-backend-00006-jn4; /health and App Check smoke tests passed. Its entries are one line each with the right severity. No /api/chat failure has happened since, so Error Reporting has only the PROBE-A/C groups. Closed on this evidence, decided with @yaisiel.torres: ACs #1-#3 from production logs (2026-09-27/28); #4 and #5 from tests (console-mode wiring test, 100/100 backend tests). Error Reporting, an extra check that isn't an AC: probe C proved a GenkitError trace in stack_trace is grouped for this service's resource, and tests prove the /api/chat failure path writes stack_trace. Not yet observed live: a real flow failure grouped in Error Reporting (needs a Gemini failure). The analyze_pun WARNING staying out of Error Reporting can't happen in production while analyze_pun uses the fixture, so it moved to TASK-11 as AC #5. DoD #2: no architectural review needed (logging format only; no contract, topology or dependency change). DoD #3: no docs describe these fields.

Filed upstream (2026-09-28): https://github.com/genkit-ai/genkit/issues/6466, which asks the google-genai plugin to stop logging failed requests at ERROR before rethrowing them (logger.debug or no log), so the app decides what to log. Repro verified locally (one failed request logs ERROR twice). @yaisiel.torres offered a PR. If it's fixed upstream, the double-log comment in backend/src/routes/chat.ts becomes stale after the Genkit upgrade.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
On Cloud Run (LOG_FORMAT=json), every Genkit logger call is written as one JSON line with a Cloud Logging severity and the call's message. Metadata stays as queryable fields: upstream detail on flow failures, the reason on App Check rejections. ERROR entries carry the stack under stack_trace, so Error Reporting groups them (it ignored Genkit's exception.stacktrace). WARNINGs keep exception.stacktrace, so handled degradation isn't reported. The Error Reporting API is now enabled. Gemini failures are logged twice (once by the Google AI plugin, once by us with the detail), a documented, deliberate choice. Verified with production logs, probe entries in Error Reporting, and 100/100 mutation-checked backend tests; local console output is unchanged.
<!-- SECTION:FINAL_SUMMARY:END -->
