# ---- JS builder (builds dist/scripts/cli/plan.js) ----
FROM node:20-bookworm-slim AS jsbuild
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json tsconfig*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Copy source code and build
COPY . .
RUN npm run build && npm run contracts:compile

# ---- Production Runtime (Python + Node) ----
FROM python:3.11-slim

# Production environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    REPO_ROOT=/app \
    NODE_BIN=node \
    PAYROX_MANIFEST_URL=http://127.0.0.1:3001 \
    PORT=8000 \
    APP_MODULE=app.main:app \
    WORKERS=2 \
    WORKER_CLASS=uvicorn.workers.UvicornWorker \
    MAX_WORKERS=4 \
    TIMEOUT=120 \
    KEEPALIVE=5

# Install system dependencies with security updates
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    git \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get purge -y gnupg \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

WORKDIR /app

# Copy and install Python dependencies (leverage Docker layer caching)
COPY requirements.txt requirements-prod.txt pyproject.toml ./
RUN pip install --upgrade pip setuptools wheel \
    && pip install -r requirements.txt \
    && pip install -r requirements-prod.txt \
    && pip install -e .[prod] \
    && (pip cache purge || true)

# Copy application code
COPY . .

# Copy built JS artifacts from builder stage
COPY --from=jsbuild /app/dist ./dist
COPY --from=jsbuild /app/artifacts ./artifacts
COPY --from=jsbuild /app/typechain-types ./typechain-types

# Copy and set up entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create non-root user for security
RUN useradd -m -u 10001 -s /bin/bash appuser \
    && chown -R appuser:appuser /app \
    && mkdir -p /app/logs /app/tmp \
    && chown -R appuser:appuser /app/logs /app/tmp \
    && find /app -type d -exec chmod 755 {} \; \
    && find /app -type f -exec chmod 644 {} \; \
    && chmod +x /app/dist/scripts/node/manifest-server.js || true

USER appuser

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=30s \
    CMD /usr/local/bin/docker-entrypoint.sh health

EXPOSE 8000 3001 3002

# Use entrypoint for better process management
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["api"]
