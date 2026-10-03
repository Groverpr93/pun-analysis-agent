# Build context is inference/:  docker build inference
# What gets sent is trimmed by inference/.dockerignore.

FROM python:3.12-slim AS wiktionary

ADD --checksum=sha256:62fedfc71c8afba3e4edd072ad07efbb314244deab41707cc15904df8cbd7338 \
    https://github.com/team-play/pun-analysis-agent/releases/download/wiktionary-data-2026-09-25/wiktionary.sqlite.gz /tmp/
RUN python -c "import gzip, shutil; shutil.copyfileobj(gzip.open('/tmp/wiktionary.sqlite.gz'), open('/wiktionary.sqlite', 'wb'))"

# uv only exists in this stage (uv's Docker guide). The runtime image starts
# uvicorn straight from the venv: `uv run` would re-check the lockfile on
# every container start, which fetches en-core-web-sm's metadata from GitHub
# and so makes each Cloud Run cold start depend on GitHub.
FROM python:3.12-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.11.26 /uv /bin/
# Precompiled bytecode makes the first import on a cold start faster.
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev
ENV WN_DATA_DIR=/wn_data
RUN .venv/bin/python -m wn download oewn:2025 && rm -rf /wn_data/downloads
# The embedding model too: fastembed would otherwise fetch it from HuggingFace
# into /tmp (in-memory on Cloud Run) on every cold start. Must match
# scoring.EMBEDDING_MODEL; the offline check below fails the build if not.
ENV FASTEMBED_CACHE_PATH=/fastembed_cache
RUN .venv/bin/python -c "from fastembed import TextEmbedding; TextEmbedding('sentence-transformers/all-MiniLM-L6-v2')" \
    && chmod -R a+rX /fastembed_cache

# Same base as the build stage, which the venv's python symlink points into.
FROM python:3.12-slim
RUN useradd --system --no-create-home app
WORKDIR /app
# HF_HUB_OFFLINE: load the baked-in model only, never download at runtime.
ENV PATH=/app/.venv/bin:$PATH WN_DATA_DIR=/wn_data \
    FASTEMBED_CACHE_PATH=/fastembed_cache HF_HUB_OFFLINE=1
COPY --from=build /app/.venv .venv
COPY --from=build /wn_data /wn_data
COPY --from=build /fastembed_cache /fastembed_cache
COPY --from=wiktionary /wiktionary.sqlite data/wiktionary.sqlite
COPY . .
USER app
# Fail the build (on every PR, not just at deploy) if the app can't read its
# data as this user: neither lookup is exercised by the deploy's smoke test,
# and a Wiktionary failure only logs and returns [] at runtime.
RUN python -c "\
from candidates import CandidateWord; \
from senses import get_wiktionary_senses, get_wordnet_senses; \
word = CandidateWord(text='interest', lemma='interest', pos='NOUN', index=0); \
assert get_wordnet_senses(word), 'no WordNet senses: check WN_DATA_DIR'; \
assert get_wiktionary_senses(word), 'no Wiktionary senses: check data/wiktionary.sqlite'; \
from scoring import default_embed; \
assert len(default_embed(['interest'])[0]) == 384, 'embedding model: check FASTEMBED_CACHE_PATH'"
# And the pun detector end to end, on the same baked-in data and embedding model.
# fastembed doesn't pin the model's revision, so a confidence far from the one
# docs/experiments/task-55 recorded means the detector's inputs drifted.
RUN python -c "from main import analysis; result = analysis.analyze('The baker needed more dough.'); \
assert result['is_pun'] is True and result['probabilities'], result; \
assert result['sense_source'] == 'wordnet' and result['words_involved'] == ['dough'], result; \
assert abs(result['confidence'] - 0.94911) < 1e-4, f'embedding model drifted: {result}'"
# Cloud Run sets PORT (8080 unless the service overrides it); exec hands
# uvicorn the shell's PID so it gets Cloud Run's SIGTERM directly.
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port \"${PORT:-8080}\""]
