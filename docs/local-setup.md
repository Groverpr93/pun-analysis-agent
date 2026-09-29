# Local Setup

Quick-start for going from a fresh clone to a running dev server in each domain. See [`project-spec.md`](project-spec.md) for the why behind the stack, and [`contracts.md`](contracts.md) for the API shapes.

## Automated setup

If you (or the agent helping you) would rather not go through the manual steps below one by one, see [`agent-setup.md`](agent-setup.md) — a tool-agnostic guide any agent can follow to detect what's installed, install what's missing (with confirmation), install dependencies, and validate the result via `node scripts/verify-setup.mjs`. The sections below are the manual/reference path — what that guide is automating, spelled out per domain.

Working across Frontend and Backend at once? `pnpm dev` from the repo root runs both dev servers concurrently (see "Lint / test / format everywhere" below) instead of opening two terminals.

## Secrets

CI's deploy credential (`GCP_SA_KEY`) is a **GitHub organization Secret**, and the backend's production Gemini key lives in **GCP Secret Manager** (see "Backend deploy" below). Neither is something you can pull down as a member: GitHub only exposes secret values to Actions runners, and the Gemini secret is readable only by the backend's runtime service account.

For local dev:
- **Gemini**: get your own key from [Google AI Studio](https://aistudio.google.com/) under the AI Studio project shown as "pun-agent" (`gen-lang-client-0125403786`), not the GCP project `pun-agent`. That project has no billing, so its keys stay on Gemini's free tier; the free-tier limits are per project, so local keys share quota with production's.
- **GCP / Cloud Run**: ask to be added to the shared GCP project's IAM, then `gcloud auth application-default login` with your own account — no key to copy.
- If you genuinely can't self-serve a key (e.g. a service account credential someone else already created), ask that teammate to share the value out-of-band (1Password, DM) — never post it in Slack/GitHub/issues.

Put local secrets in `.env` / `.env.local` files inside the relevant package folder. The root [`.gitignore`](../.gitignore) already excludes `.env*`, so they won't get committed by accident.

### Frontend deploy (CI only)

[`deploy-frontend.yml`](../.github/workflows/deploy-frontend.yml) builds `frontend/` and deploys it to Firebase Hosting (`pun-agent.web.app`) on every push to `main` that touches `frontend/**`, `packages/timeouts/**`, the root `package.json`/`pnpm-lock.yaml`/`pnpm-workspace.yaml`, or the workflow itself (or a manual run on `main`), via [`FirebaseExtended/action-hosting-deploy`](https://github.com/FirebaseExtended/action-hosting-deploy). Its build step sets `VITE_CHAT_ADAPTER=live` and `VITE_BACKEND_URL` to the Cloud Run URL below, so the deployed site talks to the real Backend; those vars live only in the workflow, so local builds and CI tests stay on the stub. It first runs the frontend tests and the shared timeouts' tests through the same [`test-js.yml`](../.github/workflows/test-js.yml) that `test.yml` uses, and deploys only if they pass; deploys run one at a time, and a newer push replaces a run still waiting. The target Firebase project ID (`pun-agent`) is committed in [`frontend/.firebaserc`](../frontend/.firebaserc) — not a secret, since a project ID isn't sensitive.

The Firebase web config and the reCAPTCHA Enterprise site key used for App Check are committed in [`frontend/src/lib/firebase/app-check.ts`](../frontend/src/lib/firebase/app-check.ts). They're public by design and ship in the bundle. The key was created in the Google Cloud console (Security → reCAPTCHA) as a score-based website key for `pun-agent.web.app` and `pun-agent.firebaseapp.com` only, and registered for the web app under Firebase's App Check → Apps. Serving the site from another domain means adding it to that key, and to Backend's CORS allowlist.

The one secret it needs is already set, at the **organization** level (the org's Settings → Secrets and variables → Actions, not the repo's), and is visible to this repo:

- `GCP_SA_KEY` — the JSON key for `github-actions-deployer@pun-agent.iam.gserviceaccount.com`, the shared deploy service account for the whole `pun-agent` GCP project. It holds `roles/firebasehosting.admin` (this workflow) plus `roles/run.admin`, `roles/artifactregistry.writer` and a project-level `roles/iam.serviceAccountUser` (the Cloud Run deploys) — reused across all three deploy workflows rather than minting a separate key per target. The project-level `serviceAccountUser` and the long-lived JSON key (rather than Workload Identity Federation) are deliberate simplifications for a course project; see TASK-13's notes.

If it ever needs rotating:

```bash
gcloud iam service-accounts keys create github-actions-deployer-key.json \
  --iam-account="github-actions-deployer@pun-agent.iam.gserviceaccount.com"
```

Paste the contents into the `GCP_SA_KEY` secret, then delete the local file and revoke the old key (`gcloud iam service-accounts keys list`/`delete`) — it's a credential, not something to keep on disk or leave active once replaced.

No local Firebase login is required to develop `frontend/` day-to-day; this secret only matters for the CI deploy step. (Chatting with a real Backend locally does need the team's App Check debug token; see "Frontend" below.)

### Backend deploy (CI only)

[`deploy-backend.yml`](../.github/workflows/deploy-backend.yml) builds [`backend/Dockerfile`](../backend/Dockerfile) on every pull request that touches the backend (build only, so a broken image fails the PR). It also runs on changes to `packages/timeouts/**`, which the image is built with. On pushes to `main` it first runs the backend tests and the shared timeouts' tests (via [`test-js.yml`](../.github/workflows/test-js.yml)), then also pushes the image to Artifact Registry, deploys it to Cloud Run and smoke-tests `/health`, authenticating with the same `GCP_SA_KEY`. It needs no other GitHub secret: the Gemini key never passes through CI.

One-time GCP setup it relies on (already done, see TASK-13's notes):

| Resource | Where | Notes |
|---|---|---|
| Cloud Run service `pun-agent-backend` | `pun-agent`, `us-east1` | `https://pun-agent-backend-203365930808.us-east1.run.app`. Public (`--allow-unauthenticated`), so `/api/*` checks a Firebase App Check token inside the app (TASK-25; see [`contracts.md`](contracts.md)), and the deploy smoke-tests that it does, `--min-instances=0`, `--max-instances=1`, and `--timeout` from `CLOUD_RUN_REQUEST_TIMEOUT_MS` in [`packages/timeouts`](../packages/timeouts/index.js) |
| Service account `pun-agent-runtime@pun-agent.iam.gserviceaccount.com` | `pun-agent` | the identity the service runs as; can read only the secret below, no project-level roles |
| Secret `gemini-api-key-runtime` | `pun-agent` Secret Manager | the production Gemini key, mounted as `GEMINI_API_KEY` |
| Gemini API key `pun-agent-runtime` | `gen-lang-client-0125403786` (no billing, free tier) | restricted to the Gemini API |
| Docker repo `pun-agent` | Artifact Registry, `us-east1` | images tagged by commit SHA, one repo version per push; cleanup policies keep each image's 3 most recent versions (3 deploys to roll back to) and delete anything else older than a day (free tier is 0.5 GB; see below) |

To rotate the production Gemini key, create a new key in the AI Studio project and pipe it straight into a new secret version, so it's never printed:

```bash
gcloud services api-keys get-key-string <NEW_KEY_UID> --project=gen-lang-client-0125403786 \
    --format='value(keyString)' | tr -d '\n' \
  | gcloud secrets versions add gemini-api-key-runtime --project=pun-agent --data-file=-
```

The `tr -d '\n'` matters: `--format='value(...)'` adds a trailing newline, which would make Gemini reject the key. Redeploy (re-run the workflow) so new instances pick up the `latest` version, then delete the old key.

#### Image retention

The repo's two cleanup policies combine as "delete anything older than a day, unless it's one of that image's 3 most recent versions", since a keep policy wins over a delete policy. Both deploy workflows push with `provenance: false`, so each deploy is exactly one version and "3 versions" means you can always roll back to the 3 latest deploys of each service. (With provenance on, `docker/build-push-action` pushes an image index plus an attestation, 3 versions per deploy, and "3 versions" would be 1 deploy.) Everything pushed in the last day or two is kept too: cleanup runs as a background job about once a day. Until each image has 3 provenance-free pushes, the repo keeps the older keep-5 policy (TASK-40), because the older pushes still count 3 versions each.

Cloud Run keeps its own copy of the image for a revision that's serving, so deleting it from the registry doesn't affect live traffic. Whether a revision that isn't serving can come back without its registry image isn't documented, so roll back only to a revision whose image is still listed.

On 2026-09-28 the repo was 393 MB of the 0.5 GB free tier, mostly the ~219 MB Inference image. Kept deploys share every unchanged layer, so a code-only deploy adds very little, but three kept Inference deploys that each changed dependencies could take ~650 MB on their own (TASK-39 reduces this). Check the size with `gcloud artifacts repositories describe pun-agent --location=us-east1`.

Deletions are logged in Data Access audit logs, which are off by default, so check what's left with `gcloud artifacts versions list --package=backend --repository=pun-agent --location=us-east1` rather than the logs. To change the policies, write the **complete** set to a file and apply it. `set-cleanup-policies` replaces every existing policy with the file's contents, so a file missing the keep policy leaves only the delete policy, which then deletes every image older than a day. Check the result with `list-cleanup-policies`:

```json
[
  {"name": "delete-older-than-1d", "action": {"type": "Delete"}, "condition": {"tagState": "any", "olderThan": "1d"}},
  {"name": "keep-3-most-recent", "action": {"type": "Keep"}, "mostRecentVersions": {"keepCount": 3}}
]
```

```bash
gcloud artifacts repositories set-cleanup-policies pun-agent --project=pun-agent \
  --location=us-east1 --policy=cleanup-policies.json
```

### Inference deploy (CI only)

[`deploy-inference.yml`](../.github/workflows/deploy-inference.yml) builds [`inference/Dockerfile`](../inference/Dockerfile) on every pull request that touches `inference/` (build only). On pushes to `main` it first runs the inference tests (via [`test-python.yml`](../.github/workflows/test-python.yml), the same workflow `test.yml` calls), then pushes the image to Artifact Registry, deploys it to Cloud Run and smoke-tests it, authenticating with the same `GCP_SA_KEY`. It needs no other GitHub secret.

Unlike Backend, the service is **private**: Cloud Run itself rejects any request without a Google-signed ID token from an identity allowed to invoke it. Backend's runtime service account is the only one granted `roles/run.invoker` on the service; project-level admins, including the CI deployer, can invoke it through their project roles. So you can't `curl` the deployed `/analyze` anonymously, and Backend's call to it has to carry an ID token (TASK-11). Every deploy re-applies Backend's invoker grant (a no-op once present), so a recreated service or a grant removed by hand is restored rather than leaving every Backend call to degrade to the undetermined result. The deploy then smoke-tests both sides: an anonymous request must get a 403, and a request with the deployer's own ID token must succeed. It checks `/openapi.json` rather than `/analyze`, which answers 500 until the classifier lands (TASK-16).

The image keeps `uv` in its build stage only and starts `uvicorn` straight from the venv. `uv run` in the image would re-check the lockfile on every container start, which fetches `en-core-web-sm`'s metadata from GitHub (the container exits if it can't), so each Cloud Run cold start would depend on GitHub. The last build step looks up a word in WordNet and Wiktionary as the runtime user, so a broken data path fails the build (on pull requests too) instead of deploying: the smoke test never touches that data, and a Wiktionary failure only logs and returns no senses at runtime.

One-time GCP setup it relies on, alongside Backend's:

| Resource | Where | Notes |
|---|---|---|
| Cloud Run service `pun-agent-inference` | `pun-agent`, `us-east1` | created by the first deploy. Private (`--no-allow-unauthenticated`), `--min-instances=0`, `--max-instances=1` |
| Service account `pun-agent-inference@pun-agent.iam.gserviceaccount.com` | `pun-agent` | the identity the service runs as; no roles at all, since Inference's data is baked into the image. Created 2026-09-28 (TASK-14) |
| Docker repo `pun-agent` | Artifact Registry, `us-east1` | shared with Backend, under `inference/`, with the same cleanup policies (see Backend deploy). The image is ~219 MB compressed (measured 2026-09-28), so it dominates the repo's size against the 0.5 GB free tier; TASK-39 tracks keeping dependency bumps from re-uploading its WordNet data |

Backend's `roles/run.invoker` grant isn't in this table because the deploy manages it.

To call the deployed service yourself, your own account needs `roles/run.invoker` (or a role that includes it) on the service, then:

```bash
curl -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  https://<pun-agent-inference URL>/openapi.json
```

## Inference (`inference/`)

Python + [`uv`](https://docs.astral.sh/uv/) (fast, reproducible dependency management — resolves and installs into a project-local `.venv` without needing a separate virtualenv command) + FastAPI + `ruff`.

```bash
cd inference
uv sync
uv run python -m wn download oewn:2025  # one-time: sense-selection's WordNet data
curl -fL --create-dirs -o data/wiktionary.sqlite.gz https://github.com/team-play/pun-analysis-agent/releases/download/wiktionary-data-2026-09-25/wiktionary.sqlite.gz && gunzip -f data/wiktionary.sqlite.gz  # one-time: sense-selection's Wiktionary data
uv run pytest
uv run ruff check .
uv run ruff format .
uv run uvicorn main:app --reload
```

The dev server serves `POST /analyze` at `http://localhost:8000`.

## Backend (`backend/`)

Node/TypeScript + [Hono](https://hono.dev/) (a lightweight, TypeScript-first web framework) + [Genkit](https://genkit.dev/) (Google's AI SDK, via the `@genkit-ai/google-genai` plugin) + pnpm.

```bash
cd backend
pnpm install
cp .env.example .env.local  # then fill in GEMINI_API_KEY, per this doc's Secrets section
pnpm dev
pnpm test
```

The dev server serves `GET /health` and `POST /api/chat` at `http://localhost:8080`. `/api/chat` requires a Firebase App Check token, exactly as in production (see [`contracts.md`](contracts.md)), so a request from the frontend's `live` mode needs its debug token (see "Frontend" below). To call it without one, e.g. with `curl`, set `APP_CHECK=off` in `backend/.env.local`; the server warns at startup while it's off. Only the exact value `off` disables the check, so a deployed service with no setting is always protected, and on Cloud Run (detected by the `K_SERVICE` variable it always sets) `APP_CHECK=off` makes the server refuse to start, so a revision configured that way never serves traffic. `analyze_pun`'s calls to Inference answer from a fixture until TASK-11, so Inference doesn't need to be running; after that, `INFERENCE_URL` (default `http://localhost:8000`) points Backend at it. `GEMINI_MODEL` picks the Gemini model `/api/chat` talks to. Unset, it's production's ladder of models (two Flash-Lite models, then `gemini-3.8-flash`; TASK-45), which `/api/chat` steps down when a model fails (see [`contracts.md`](contracts.md)'s "Retries."). Set, it's that one model only: failures are retried but never switched to another model, so a local run measures exactly the model you named (e.g. `gemini-3.5-flash-lite`). `pnpm test` never needs `GEMINI_API_KEY` set — it runs against a Genkit test-double model instead (see [`engineering-practices.md`](engineering-practices.md)'s "Backend in isolation" section). Sanity-check the dev server with:

```bash
curl localhost:8080/health
```

Locally, Backend logs as plain console text. The Docker image sets `LOG_FORMAT=json` ([`backend/Dockerfile`](../backend/Dockerfile)), which writes each log call as one JSON line with a `severity` and `message`: that is what makes Cloud Run store it as one Logs Explorer entry with the right severity, rather than one entry per line of a stack trace (TASK-29). Set `LOG_FORMAT=json` locally to see exactly what Cloud Run receives. Any value other than `console` or `json` makes the server refuse to start.

`pnpm dev` and `pnpm test` run the TypeScript directly on Node 24, with no loader like `tsx`. `pnpm test` uses Node's built-in test runner (`node:test`) against [`backend/tests/`](../backend/tests/) — see [`engineering-practices.md`](engineering-practices.md) for why no separate test framework is needed here.

## Frontend (`frontend/`)

Vite + React, pnpm.

```bash
cd frontend
pnpm install
pnpm dev
pnpm test
```

Opens the dev server at `http://localhost:5173`. `pnpm test` runs Vitest + React Testing Library (config in [`frontend/vite.config.ts`](../frontend/vite.config.ts)) — see [`design/frontend-design.md`](design/frontend-design.md)'s "Development & testing" section for what's covered.

`VITE_CHAT_ADAPTER=stub|live` (see [`engineering-practices.md`](engineering-practices.md); example in [`frontend/.env.example`](../frontend/.env.example)) picks between a stubbed backend and this repo's real one. Unset defaults to `stub`, which is what CI and unit tests always use. In `stub` mode, a trigger word in your message (e.g. `pun`, `fallback`, `slow`) shows each `analyze_pun` card state; the full list is in [`design/frontend-design.md`](design/frontend-design.md)'s "Fixture sharing". `live` streams real replies from the Backend at `VITE_BACKEND_URL` (its base URL, e.g. `http://localhost:8080` for the Backend dev server above) and fails fast at startup if that's unset. To chat with real Gemini locally, run the Backend dev server, then start the frontend with both set (e.g. in `frontend/.env.local`):

```bash
VITE_CHAT_ADAPTER=live VITE_BACKEND_URL=http://localhost:8080 pnpm dev
```

`live` mode also needs a Firebase App Check token for every request. The deployed site gets one through reCAPTCHA Enterprise, but `localhost` is deliberately not on the reCAPTCHA key's domain allowlist (anyone could serve a page from their own `localhost`), so `pnpm dev` uses an App Check **debug token** instead. The team shares one, registered in the Firebase console (project `pun-agent`, **App Check → Apps → ⋮ → Manage debug tokens**) and kept in the team's 1Password; ask Yai Torres for it. Put it in `frontend/.env.local`:

```bash
VITE_APPCHECK_DEBUG_TOKEN=<the shared debug token>
```

Without it, `live` mode can't get a token, so every message fails with "Couldn't get a reply" before reaching Backend (`APP_CHECK=off` on Backend doesn't help: the frontend stops first). If it's unset, the SDK generates a new token instead, which works once someone with console access registers it.

A debug token gets real App Check tokens from anywhere, so treat it like a password: keep it in `.env.local` and 1Password only, and if it leaks, delete it in the console and share a new one. The SDK prints it to the browser console as `Firebase App Check debug token: <uuid>` on every `pnpm dev` load in `live` mode, whether it's the shared one or a new one, so close devtools before screen sharing, and rotate it if it shows up anywhere. Only `pnpm dev` reads it; production builds drop that code.

The frontend must stay on `http://localhost:5173`: that's the dev origin Backend's CORS allowlist accepts by default (alongside the two deployed Firebase Hosting domains, `pun-agent.web.app` and `pun-agent.firebaseapp.com`) (`CORS_ORIGIN` in `backend/` overrides it).

## Eval (`eval/`)

Python + `uv` + [marimo](https://marimo.io/) (reactive, git-diffable Python notebooks — cells re-run automatically based on their dependencies, and the notebook file is plain, readable Python rather than JSON).

```bash
cd eval
uv sync
uv run marimo edit notebooks/dummy_notebook.py
```

## Lint / test / format everywhere

```bash
# from the repo root — runs both frontend/ and backend/ dev servers together
pnpm dev

# from the repo root — runs both frontend/ and backend/ test suites
pnpm run test

# from the repo root — covers backend/ and frontend/ (shared Biome config)
pnpm run lint

# also from the repo root — validates every ```mermaid block in the repo's docs
pnpm run check:mermaid

# inside inference/ or eval/
uv run ruff check .
uv run ruff format --check .

# from the repo root, with Docker running — lints .github/workflows/ (actionlint + shellcheck)
docker run --rm -v "$PWD:/repo" --workdir /repo rhysd/actionlint:1.7.12 -color
```

[`.github/workflows/lint.yml`](../.github/workflows/lint.yml) and [`.github/workflows/test.yml`](../.github/workflows/test.yml) run all of the above (lint/mermaid/ruff lint and format/actionlint, and the frontend/backend/shared-timeouts/inference test suites plus the frontend's production build, respectively) on every push/PR, so failures show up in CI even if you skip running them locally.

### Pre-commit hook

`pnpm install` (from anywhere in the workspace) also installs a git pre-commit hook, via [Lefthook](https://lefthook.dev/) and the repo's [`lefthook.yml`](../lefthook.yml). On each commit it fixes just the staged files and re-stages them: `biome check --write` for JS/TS/JSON/CSS, and `ruff check --fix` then `ruff format` for Python in `inference/` or `eval/`. Both apply safe lint fixes as well as formatting (e.g. dropping an unused import), and an unfixable lint error blocks the commit. Merges and rebases skip it.

- It needs both toolchains: Node/pnpm to be installed at all, and `uv` whenever Python is staged (the commit fails with an explanation if `uv` is missing). A Python-only contributor still needs one `pnpm install` to get the hook; CI's `ruff format --check` catches anything committed without it.
- Skip it for one commit with `git commit --no-verify` or `LEFTHOOK=0 git commit`.
- The hook lives in the repo's shared `.git/hooks`, so every worktree uses it; whichever checkout last ran `pnpm install` is the one whose Lefthook it calls. Branches without `lefthook.yml` commit normally.
- If you stage only part of a file, the unstaged part is kept out of the commit, but an unstaged edit right next to lines the formatter rewrites can be put back a line or two off. Check `git diff` afterwards in that case.
