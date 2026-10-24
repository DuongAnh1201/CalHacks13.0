FROM python:3.12-slim

# uv binary
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# 1. Dependencies first (cached unless pyproject/uv.lock change)
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

RUN useradd --create-home appuser

# 2. Application code, viewer, weights
COPY --chown=appuser src/ ./src/
COPY weights/ ./weights/
COPY brats_mri_segmentation/configs/metadata.json ./brats_mri_segmentation/configs/metadata.json
COPY seed/ ./seed/

# 3. Run as non-root user
RUN mkdir -p /app/jobs \
 && chown -R appuser /app/jobs
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://localhost:{os.environ.get(\"PORT\", \"8000\")}/health')" || exit 1

# PORT lets RunPod (or any host) pick the listening port; local default stays 8000.
CMD ["sh", "-c", "exec uvicorn src.api:app --host 0.0.0.0 --port \"${PORT:-8000}\" --workers 1"]