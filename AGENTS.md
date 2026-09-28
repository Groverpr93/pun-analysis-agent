# Agent Instructions

Instructions for any agent (Claude Code or otherwise) working in this repo.

## Discovery

If your local environment isn't set up yet, start with [`docs/agent-setup.md`](docs/agent-setup.md) — tool-agnostic setup instructions any agent can follow to bootstrap this repo on a fresh machine.

Before making a change — especially one that touches more than one domain — read:
- [`docs/local-setup.md`](docs/local-setup.md) for how each package (`inference/`, `backend/`, `frontend/`, `eval/`, plus `packages/timeouts/`, the timeouts Frontend and Backend share) is installed and run locally.
- [`docs/project-spec.md`](docs/project-spec.md) for the stack, architecture, and which domain owns what.
- [`docs/engineering-practices.md`](docs/engineering-practices.md) for cross-domain isolation, testing, dev-experience, and the progressive-enhancement order Backend/Frontend get built in.
- [`docs/contracts.md`](docs/contracts.md) for the exact `/analyze` and `/api/chat` schemas. Treat these as the source of truth — if a change requires altering either shape, update `contracts.md` in the same change and flag it, since both sides of the contract depend on it.
- [`docs/tasks.md`](docs/tasks.md) for how work is tracked. See the Backlog.md workflow block below for the moment-to-moment task commands.

## Coding guide

- Write idiomatic code for whichever language/framework you're in, not a generic style forced across all four packages:
  - `backend/`: idiomatic Hono (middleware, `c.json`/`c.text` helpers, route composition) — see [`backend/src/index.ts`](backend/src/index.ts).
  - `inference/`: idiomatic FastAPI + Pydantic (response models, dependency injection) — see [`inference/main.py`](inference/main.py).
  - `frontend/`: idiomatic React/Vite conventions.
  - `inference/` and `eval/`: idiomatic `uv`/`ruff` project conventions (respect `pyproject.toml`, don't hand-roll what `uv` already manages).
- DRY: before adding new logic, check whether it already exists — especially anything touching the `/analyze` or `/api/chat` contracts, where duplicated schema definitions are the most likely place for the two sides to drift.
- No speculative abstractions or unused flexibility — match the scope of the task in front of you.

## Code review

Before considering any non-trivial change done, solicit a critical, adversarial review from a subagent (e.g. this repo's `code-review` skill, or an equivalent independent review pass) rather than self-certifying the diff. Two things are non-negotiable in that review:
- **Test coverage** — new logic needs tests that would actually fail if the logic were wrong, not just tests that exercise the happy path.
- **Human-readable code** — a teammate who wasn't in the room should be able to follow the code without extra explanation.

## Architectural review

Any change that touches architectural matters — the `/analyze` or `/api/chat` contracts in [`docs/contracts.md`](docs/contracts.md), the stack/service topology or sync points in [`docs/project-spec.md`](docs/project-spec.md), the cross-domain isolation guarantees or progressive-enhancement phase order in [`docs/engineering-practices.md`](docs/engineering-practices.md), or introducing a new service, dependency, or deploy target — needs a review from a subagent briefed specifically to look for architectural problems before the change is considered done, in addition to (not instead of) the code review above. Architectural review looks for a different class of issue than code review: hidden coupling between domains, a "Phase N only" claim that something earlier actually depends on, contradictions between two docs describing the same boundary, or an isolation/contract claim that doesn't hold up against how the pieces actually connect. Brief that subagent with the specific docs/files the change touches and ask it to verify claims against the current repo state, not just read the diff in isolation.

## Performance

This runs entirely on free tiers (Cloud Run, Firebase Hosting, Gemini's free quota), so memory and compute efficiency are a design constraint from the start, not a later optimization pass:
- Keep container images small and dependency lists tight — every extra package is cold-start cost on Cloud Run.
- Avoid loading heavyweight resources (models, large lookup tables) eagerly at import time if they can be loaded lazily or scoped to where they're needed.
- Watch for anything that would multiply Gemini API calls or Cloud Run invocations unnecessarily (retries without backoff, polling, redundant tool calls).

**Perf budgets:** TBD — placeholder until `inference/` has a real classifier to measure. Fill in concrete numbers once it exists, and re-check them whenever the model or hosting tier changes.

| Metric | Budget | Status |
|---|---|---|
| `/analyze` p50 latency | TBD | not yet measured |
| `/analyze` p95 latency | TBD | not yet measured |
| Inference container memory ceiling | TBD | not yet measured |
| `/api/chat` end-to-end latency (excluding cold start) | TBD | not yet measured |

## Docs alignment

After committing a change, check whether it touched anything the docs describe — a new script, a changed command, a stack swap, a new CI step, a new skill — and diff that against `README.md`, `docs/project-spec.md`, `docs/local-setup.md`, and this file. If any of them have drifted, make a **separate follow-up commit** that updates the docs rather than leaving the mismatch for someone else to discover or folding the fix into the commit that caused it — a distinct commit keeps "why did the docs change" answerable from the log alone.

<!-- BACKLOG.MD GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.52.0 -->
<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**At the beginning of each conversation in this project, run `backlog instructions overview` before answering or taking action. Re-read it only if you have not read it yet in the current conversation.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Before task lifecycle actions, read the matching detailed guide:
- `backlog instructions task-creation` before creating or splitting tasks
- `backlog instructions task-execution` before planning, changing status or assignee, adding a plan or implementation notes, or implementing task work
- `backlog instructions task-finalization` before checking acceptance criteria, writing final summaries, or moving tasks to terminal statuses

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->
