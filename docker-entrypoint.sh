#!/bin/bash
set -e

# PayRox Production Entrypoint Script
# Handles graceful startup, health checks, and signal management

# Default values
PORT=${PORT:-8000}
WORKERS=${WORKERS:-2}
WORKER_CLASS=${WORKER_CLASS:-uvicorn.workers.UvicornWorker}
APP_MODULE=${APP_MODULE:-app.main:app}
LOG_LEVEL=${LOG_LEVEL:-info}

# Health check function
check_health() {
    local max_attempts=30
    local attempt=1

    echo "🔍 Waiting for application to be ready..."

    while [ $attempt -le $max_attempts ]; do
        if curl -fsS "http://localhost:${PORT}/health" >/dev/null 2>&1; then
            echo "✅ Application is healthy (attempt $attempt/$max_attempts)"
            return 0
        fi

        echo "⏳ Health check failed, retrying in 2s... (attempt $attempt/$max_attempts)"
        sleep 2
        attempt=$((attempt + 1))
    done

    echo "❌ Application failed to start after $max_attempts attempts"
    return 1
}

# Signal handlers for graceful shutdown
shutdown_handler() {
    echo "🛑 Received shutdown signal, gracefully stopping..."
    if [ ! -z "$APP_PID" ]; then
        kill -TERM "$APP_PID" 2>/dev/null || true
        wait "$APP_PID" 2>/dev/null || true
    fi
    echo "✅ Shutdown complete"
    exit 0
}

# Set up signal traps
trap shutdown_handler SIGTERM SIGINT SIGQUIT

# Ensure required directories exist
mkdir -p /app/logs /app/tmp

# Start application based on command
case "$1" in
    "api"|"")
        echo "🚀 Starting PayRox API server..."
        echo "   Port: $PORT"
        echo "   Workers: $WORKERS"
        echo "   Worker Class: $WORKER_CLASS"
        echo "   Log Level: $LOG_LEVEL"
        echo "   Module: $APP_MODULE"

        # Start the application in background for health checking
        exec uvicorn "$APP_MODULE" \
            --host 0.0.0.0 \
            --port "$PORT" \
            --workers "$WORKERS" \
            --worker-class "$WORKER_CLASS" \
            --log-level "$LOG_LEVEL" \
            --access-log \
            --date-header \
            --server-header &

        APP_PID=$!

        # Wait for the process to complete
        wait "$APP_PID"
        ;;

    "manifest")
        echo "🔧 Starting PayRox Manifest Server..."

        # Ensure Node.js built assets exist
        if [ ! -f "/app/dist/scripts/node/manifest-server.js" ]; then
            echo "❌ Manifest server script not found at /app/dist/scripts/node/manifest-server.js"
            echo "🔧 Building Node.js assets..."
            cd /app && npm run build
        fi

        exec node /app/dist/scripts/node/manifest-server.js &
        APP_PID=$!

        # Wait for the process to complete
        wait "$APP_PID"
        ;;

    "health")
        echo "🔍 Running health check..."
        check_health
        exit $?
        ;;

    *)
        echo "🚀 Running custom command: $@"
        exec "$@"
        ;;
esac
