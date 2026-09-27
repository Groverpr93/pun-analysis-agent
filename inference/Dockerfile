FROM python:3.12-slim AS wiktionary

ADD --checksum=sha256:62fedfc71c8afba3e4edd072ad07efbb314244deab41707cc15904df8cbd7338 \
    https://github.com/team-play/pun-analysis-agent/releases/download/wiktionary-data-2026-09-25/wiktionary.sqlite.gz /tmp/
RUN python -c "import gzip, shutil; shutil.copyfileobj(gzip.open('/tmp/wiktionary.sqlite.gz'), open('/wiktionary.sqlite', 'wb'))"

FROM python:3.12-slim

RUN pip install --no-cache-dir uv

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
RUN uv run --no-dev python -m wn download oewn:2025 && rm -rf /root/.wn_data/downloads
COPY --from=wiktionary /wiktionary.sqlite data/wiktionary.sqlite

COPY . .

ENV PORT=8080
CMD ["uv", "run", "--no-dev", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
