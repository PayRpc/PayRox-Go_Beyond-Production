#!/bin/bash
# PayRox Production Deployment Script
# Use this for production deployments

set -e

echo "🚀 PayRox Production Deployment"
echo "================================"

# Configuration
REGISTRY=${DOCKER_REGISTRY:-""}
IMAGE_TAG=${IMAGE_TAG:-"latest"}
ENVIRONMENT=${ENVIRONMENT:-"production"}

# Build configuration
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

# Deployment steps
deploy_step() {
    local step_name="$1"
    shift
    echo ""
    echo "📦 Step: $step_name"
    echo "$(printf '%.0s-' {1..40})"
    "$@"
    echo "✅ $step_name completed"
}

# Pre-deployment checks
pre_deploy_checks() {
    echo "🔍 Running pre-deployment checks..."

    # Check if required files exist
    if [ ! -f "Dockerfile" ]; then
        echo "❌ Dockerfile not found"
        exit 1
    fi

    if [ ! -f "docker-compose.yml" ]; then
        echo "❌ docker-compose.yml not found"
        exit 1
    fi

    if [ ! -f "requirements.txt" ]; then
        echo "❌ requirements.txt not found"
        exit 1
    fi

    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        echo "❌ Docker is not running"
        exit 1
    fi

    # Check if necessary environment files exist
    if [ ! -f ".env.${ENVIRONMENT}" ]; then
        echo "⚠️  Environment file .env.${ENVIRONMENT} not found, using defaults"
    fi

    echo "✅ Pre-deployment checks passed"
}

# Build images
build_images() {
    echo "🏗️  Building PayRox images..."

    # Build with cache and multi-stage optimization
    docker build \
        --build-arg BUILDKIT_INLINE_CACHE=1 \
        --cache-from payrox-api:latest \
        -t payrox-api:${IMAGE_TAG} \
        -t payrox-api:latest \
        .

    if [ ! -z "$REGISTRY" ]; then
        docker tag payrox-api:${IMAGE_TAG} ${REGISTRY}/payrox-api:${IMAGE_TAG}
        docker tag payrox-api:latest ${REGISTRY}/payrox-api:latest
    fi
}

# Test images
test_images() {
    echo "🧪 Testing built images..."

    # Quick smoke test
    docker run --rm --entrypoint="" payrox-api:${IMAGE_TAG} python -c "import app.main; print('✅ Python app imports successfully')"
    docker run --rm --entrypoint="" payrox-api:${IMAGE_TAG} node --version
    docker run --rm --entrypoint="" payrox-api:${IMAGE_TAG} python --version
}

# Deploy services
deploy_services() {
    echo "🚀 Deploying services..."

    # Use environment-specific compose file if available
    COMPOSE_FILE="docker-compose.yml"
    if [ -f "docker-compose.${ENVIRONMENT}.yml" ]; then
        COMPOSE_FILE="docker-compose.yml:docker-compose.${ENVIRONMENT}.yml"
    fi

    # Load environment file
    if [ -f ".env.${ENVIRONMENT}" ]; then
        export $(cat .env.${ENVIRONMENT} | grep -v '^#' | xargs)
    fi

    # Deploy with compose
    docker-compose -f $COMPOSE_FILE down --remove-orphans || true
    docker-compose -f $COMPOSE_FILE up -d --build

    # Wait for services to be healthy
    echo "⏳ Waiting for services to be healthy..."
    docker-compose -f $COMPOSE_FILE ps

    # Wait up to 2 minutes for all services to be healthy
    local timeout=120
    local elapsed=0
    while [ $elapsed -lt $timeout ]; do
        if docker-compose -f $COMPOSE_FILE ps | grep -q "unhealthy\|starting"; then
            echo "⏳ Services still starting... (${elapsed}s/${timeout}s)"
            sleep 5
            elapsed=$((elapsed + 5))
        else
            echo "✅ All services are healthy"
            return 0
        fi
    done

    echo "⚠️  Some services may not be fully healthy yet"
    docker-compose -f $COMPOSE_FILE ps
}

# Post-deployment verification
post_deploy_verification() {
    echo "🔍 Post-deployment verification..."

    # Check service endpoints
    local api_url="http://localhost:8000"
    local manifest_url="http://localhost:3001"

    echo "Testing API endpoint..."
    if curl -fsS "${api_url}/health" >/dev/null; then
        echo "✅ API service is responding"
    else
        echo "❌ API service is not responding"
        return 1
    fi

    echo "Testing Manifest service..."
    if curl -fsS "${manifest_url}" >/dev/null 2>&1; then
        echo "✅ Manifest service is responding"
    else
        echo "⚠️  Manifest service may not be ready yet"
    fi

    # Show deployment summary
    echo ""
    echo "📊 Deployment Summary:"
    echo "======================="
    docker-compose ps
    echo ""
    echo "🌐 Service URLs:"
    echo "  API: ${api_url}"
    echo "  Manifest: ${manifest_url}"
    echo "  WebSocket: http://localhost:3002"
}

# Main deployment flow
main() {
    deploy_step "Pre-deployment checks" pre_deploy_checks
    deploy_step "Build images" build_images
    deploy_step "Test images" test_images
    deploy_step "Deploy services" deploy_services
    deploy_step "Post-deployment verification" post_deploy_verification

    echo ""
    echo "🎉 PayRox deployment completed successfully!"
    echo "=========================================="
    echo ""
    echo "Next steps:"
    echo "1. Monitor logs: docker-compose logs -f"
    echo "2. Check metrics: curl http://localhost:8000/metrics"
    echo "3. View API docs: http://localhost:8000/docs"
}

# Execute deployment
main "$@"
