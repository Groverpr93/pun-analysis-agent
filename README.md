# Pun Analysis Agent

A conversational agent that detects and explains puns in text, built as a Gemini/Genkit-orchestrated pipeline with a dedicated inference service and a React chat frontend.

## Domains

| Domain | Owns | Owner |
|---|---|---|
| Inference | [`inference/`](inference/) — pun classifier, WSD, `/analyze` endpoint | Livia Esquejo Castro (Pun Detection), Andi J. Castillo-Mauricio (Sense Selection) |
| Backend | [`backend/`](backend/) — Genkit orchestration, `analyze_pun` tool, `/api/chat` | Yai Torres |
| Frontend | [`frontend/`](frontend/) — React chat UI on Firebase Hosting | Yai Torres |
| Data / Eval | [`eval/`](eval/) — dataset curation, evaluation, write-up | Prateek Grover (lead); all four contribute |

See [`docs/project-spec.md`](docs/project-spec.md) for the full spec (stack, architecture, task breakdown), [`docs/engineering-practices.md`](docs/engineering-practices.md) for cross-domain isolation/testing/dev-experience practices and the progressive-enhancement build order, [`docs/milestones/milestone-3.md`](docs/milestones/milestone-3.md) for the reasoning behind the domain split above, [`docs/contracts.md`](docs/contracts.md) for the two cross-domain API contracts (`/analyze` and `/api/chat`), [`docs/design/`](docs/design/) for deeper technical designs (e.g. sense selection, frontend) as they're written, [`docs/references.md`](docs/references.md) for APA 7 citations, [`docs/local-setup.md`](docs/local-setup.md) to get a dev server running locally, and [`docs/tasks.md`](docs/tasks.md) for how work is tracked (Backlog.md, tasks as Markdown in [`.backlog/`](.backlog/)).

## Getting started

```bash
cd inference && uv sync && uv run python -m wn download oewn:2025
# plus sense selection's Wiktionary data: see docs/local-setup.md (Inference) for the download step
cd backend && pnpm install
cd frontend && pnpm install
cd eval && uv sync
```

`frontend` and `backend` share a pnpm workspace, so `pnpm install` from the repo root also works for both. It also installs a git pre-commit hook that formats staged files, so run it once even if you only work in `inference/` or `eval/` (see [`docs/local-setup.md`](docs/local-setup.md)'s "Pre-commit hook").
