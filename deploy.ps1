#!/usr/bin/env pwsh
<#
.SYNOPSIS
    PayRox Refactor Studio - Production Deployment Script

.DESCRIPTION
    Comprehensive deployment script for PayRox Refactor Studio with async job system.
    Supports Docker Compose, Kubernetes, and cloud deployments.

.PARAMETER Mode
    Deployment mode: local, docker, k8s, or cloud

.PARAMETER Environment
    Target environment: dev, staging, prod

.PARAMETER Platform
    Target platform: docker-compose, kubernetes, azure, aws, gcp

.EXAMPLE
    ./deploy.ps1 -Mode docker -Environment prod
    ./deploy.ps1 -Mode k8s -Environment staging -Platform azure
#>

param(
    [Parameter(Mandatory = $false)]
    [ValidateSet("local", "docker", "k8s", "cloud")]
    [string]$Mode = "docker",

    [Parameter(Mandatory = $false)]
    [ValidateSet("dev", "staging", "prod")]
    [string]$Environment = "prod",

    [Parameter(Mandatory = $false)]
    [ValidateSet("docker-compose", "kubernetes", "azure", "aws", "gcp")]
    [string]$Platform = "docker-compose"
)

# Color output functions
function Write-Success { param($Message) Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Info { param($Message) Write-Host "ℹ️  $Message" -ForegroundColor Cyan }
function Write-Warning { param($Message) Write-Host "⚠️  $Message" -ForegroundColor Yellow }
function Write-Error { param($Message) Write-Host "❌ $Message" -ForegroundColor Red }
function Write-Step { param($Message) Write-Host "🚀 $Message" -ForegroundColor Magenta }

# Configuration
$script:Config = @{
    AppName        = "payrox-refactor-studio"
    Version        = "1.0.0"
    DockerRegistry = "payrox"
    Namespace      = "payrox-system"

    # Ports
    ApiPort        = 8000
    ManifestPort   = 3001
    WebSocketPort  = 3002

    # Resource limits
    CpuRequest     = "500m"
    CpuLimit       = "2000m"
    MemoryRequest  = "1Gi"
    MemoryLimit    = "4Gi"

    # Environment-specific configs
    Environments   = @{
        dev     = @{
            Replicas   = 1
            Workers    = 1
            LogLevel   = "debug"
            MaxWorkers = 2
        }
        staging = @{
            Replicas   = 2
            Workers    = 2
            LogLevel   = "info"
            MaxWorkers = 4
        }
        prod    = @{
            Replicas   = 3
            Workers    = 4
            LogLevel   = "warning"
            MaxWorkers = 8
        }
    }
}

function Test-Prerequisites {
    Write-Step "Checking deployment prerequisites..."

    $tools = @()
    if ($Mode -eq "docker" -or $Platform -eq "docker-compose") {
        $tools += "docker", "docker-compose"
    }
    if ($Mode -eq "k8s" -or $Platform -eq "kubernetes") {
        $tools += "kubectl", "helm"
    }

    foreach ($tool in $tools) {
        if (!(Get-Command $tool -ErrorAction SilentlyContinue)) {
            Write-Error "$tool is not installed or not in PATH"
            exit 1
        }
        Write-Success "$tool is available"
    }
}

function Build-Application {
    Write-Step "Building PayRox Refactor Studio..."

    # Check if app/jobs.py exists
    if (!(Test-Path "app/jobs.py")) {
        Write-Error "app/jobs.py not found. Please ensure the async job system is implemented."
        exit 1
    }

    # Check if web-ui/index.html exists
    if (!(Test-Path "web-ui/index.html")) {
        Write-Error "web-ui/index.html not found. Please ensure the web UI is implemented."
        exit 1
    }

    Write-Success "Application components verified"

    # Build Docker image if needed
    if ($Mode -eq "docker" -or $Mode -eq "k8s") {
        Write-Info "Building Docker image..."
        $imageName = "$($script:Config.DockerRegistry)/$($script:Config.AppName):$($script:Config.Version)"

        docker build -t $imageName . --no-cache
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Docker build failed"
            exit 1
        }

        # Tag as latest for the environment
        docker tag $imageName "$($script:Config.DockerRegistry)/$($script:Config.AppName):$Environment-latest"
        Write-Success "Docker image built: $imageName"
    }
}

function Deploy-Local {
    Write-Step "Deploying locally..."

    # Kill existing processes
    Write-Info "Stopping existing services..."
    Get-Process | Where-Object { $_.ProcessName -match "uvicorn|node" } | Stop-Process -Force -ErrorAction SilentlyContinue

    # Start the application
    Write-Info "Starting PayRox Refactor Studio..."
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-Command",
        "cd '$PWD/app'; python -m uvicorn main:app --host 0.0.0.0 --port $($script:Config.ApiPort) --reload"
    )

    Start-Sleep 3
    Write-Success "Application started on http://localhost:$($script:Config.ApiPort)"
}

function Deploy-Docker {
    Write-Step "Deploying with Docker Compose..."

    # Create environment file
    $envConfig = $script:Config.Environments[$Environment]

    $envContent = @"
# PayRox Refactor Studio Environment Configuration
ENVIRONMENT=$Environment
PORT=$($script:Config.ApiPort)
WORKERS=$($envConfig.Workers)
MAX_WORKERS=$($envConfig.MaxWorkers)
LOG_LEVEL=$($envConfig.LogLevel)
REDIS_URL=redis://redis:6379/0
PAYROX_MANIFEST_URL=http://payrox-manifest:$($script:Config.ManifestPort)
PYTHONPATH=/app
NODE_ENV=production

# Resource limits
CPU_REQUEST=$($script:Config.CpuRequest)
CPU_LIMIT=$($script:Config.CpuLimit)
MEMORY_REQUEST=$($script:Config.MemoryRequest)
MEMORY_LIMIT=$($script:Config.MemoryLimit)
"@

    $envContent | Out-File -FilePath ".env" -Encoding UTF8
    Write-Success "Environment file created: .env"

    # Deploy with Docker Compose
    Write-Info "Starting services with Docker Compose..."
    docker-compose down --remove-orphans
    docker-compose up -d --build

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Docker Compose deployment failed"
        exit 1
    }

    # Wait for services to be healthy
    Write-Info "Waiting for services to be healthy..."
    $maxWait = 60
    $waited = 0

    do {
        Start-Sleep 5
        $waited += 5
        $health = docker-compose ps --services --filter "status=running" | Measure-Object | Select-Object -ExpandProperty Count
        Write-Info "Services running: $health"
    } while ($health -lt 2 -and $waited -lt $maxWait)

    if ($health -ge 2) {
        Write-Success "Docker Compose deployment successful!"
        Write-Info "Access the application at: http://localhost:$($script:Config.ApiPort)"
        Write-Info "Manifest server at: http://localhost:$($script:Config.ManifestPort)"

        # Show running services
        docker-compose ps
    }
    else {
        Write-Error "Services failed to start within $maxWait seconds"
        docker-compose logs
        exit 1
    }
}

function Deploy-Kubernetes {
    Write-Step "Deploying to Kubernetes..."

    # Create namespace
    kubectl create namespace $script:Config.Namespace --dry-run=client -o yaml | kubectl apply -f -
    Write-Success "Namespace created/updated: $($script:Config.Namespace)"

    # Generate Kubernetes manifests
    Generate-KubernetesManifests

    # Apply manifests
    Write-Info "Applying Kubernetes manifests..."
    kubectl apply -f "./k8s/" -n $script:Config.Namespace

    # Wait for deployment
    Write-Info "Waiting for deployment to be ready..."
    kubectl rollout status deployment/$($script:Config.AppName) -n $script:Config.Namespace --timeout=300s

    # Get service information
    $service = kubectl get svc $($script:Config.AppName) -n $script:Config.Namespace -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
    if ($service) {
        Write-Success "Kubernetes deployment successful!"
        Write-Info "Access the application at: http://$service:$($script:Config.ApiPort)"
    }
    else {
        Write-Info "Deployment successful! Use port-forward to access:"
        Write-Info "kubectl port-forward svc/$($script:Config.AppName) $($script:Config.ApiPort):$($script:Config.ApiPort) -n $($script:Config.Namespace)"
    }
}

function Generate-KubernetesManifests {
    Write-Info "Generating Kubernetes manifests..."

    $envConfig = $script:Config.Environments[$Environment]

    if (!(Test-Path "k8s")) {
        New-Item -Path "k8s" -ItemType Directory | Out-Null
    }

    # Deployment manifest
    $deploymentYaml = @"
apiVersion: apps/v1
kind: Deployment
metadata:
  name: $($script:Config.AppName)
  labels:
    app: $($script:Config.AppName)
    version: $($script:Config.Version)
    environment: $Environment
spec:
  replicas: $($envConfig.Replicas)
  selector:
    matchLabels:
      app: $($script:Config.AppName)
  template:
    metadata:
      labels:
        app: $($script:Config.AppName)
        version: $($script:Config.Version)
    spec:
      containers:
      - name: api
        image: $($script:Config.DockerRegistry)/$($script:Config.AppName):$($script:Config.Version)
        ports:
        - containerPort: $($script:Config.ApiPort)
        - containerPort: $($script:Config.ManifestPort)
        - containerPort: $($script:Config.WebSocketPort)
        env:
        - name: ENVIRONMENT
          value: "$Environment"
        - name: PORT
          value: "$($script:Config.ApiPort)"
        - name: WORKERS
          value: "$($envConfig.Workers)"
        - name: MAX_WORKERS
          value: "$($envConfig.MaxWorkers)"
        - name: LOG_LEVEL
          value: "$($envConfig.LogLevel)"
        - name: REDIS_URL
          value: "redis://redis:6379/0"
        resources:
          requests:
            cpu: $($script:Config.CpuRequest)
            memory: $($script:Config.MemoryRequest)
          limits:
            cpu: $($script:Config.CpuLimit)
            memory: $($script:Config.MemoryLimit)
        livenessProbe:
          httpGet:
            path: /health
            port: $($script:Config.ApiPort)
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: $($script:Config.ApiPort)
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: $($script:Config.AppName)
  labels:
    app: $($script:Config.AppName)
spec:
  type: LoadBalancer
  ports:
  - name: api
    port: $($script:Config.ApiPort)
    targetPort: $($script:Config.ApiPort)
  - name: manifest
    port: $($script:Config.ManifestPort)
    targetPort: $($script:Config.ManifestPort)
  - name: websocket
    port: $($script:Config.WebSocketPort)
    targetPort: $($script:Config.WebSocketPort)
  selector:
    app: $($script:Config.AppName)
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  labels:
    app: redis
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        ports:
        - containerPort: 6379
        args:
        - redis-server
        - --appendonly
        - "yes"
        - --maxmemory
        - 256mb
        - --maxmemory-policy
        - allkeys-lru
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 500m
            memory: 512Mi
---
apiVersion: v1
kind: Service
metadata:
  name: redis
  labels:
    app: redis
spec:
  ports:
  - port: 6379
    targetPort: 6379
  selector:
    app: redis
"@

    $deploymentYaml | Out-File -FilePath "k8s/deployment.yaml" -Encoding UTF8
    Write-Success "Kubernetes manifests generated in k8s/"
}

function Show-Status {
    Write-Step "Deployment Status"

    switch ($Mode) {
        "local" {
            Write-Info "Local deployment status:"
            $processes = Get-Process | Where-Object { $_.ProcessName -match "uvicorn|python" }
            if ($processes) {
                Write-Success "Application is running (PID: $($processes.Id -join ', '))"
            }
            else {
                Write-Warning "No application processes found"
            }
        }
        "docker" {
            Write-Info "Docker Compose status:"
            docker-compose ps

            Write-Info "`nContainer health:"
            docker-compose ps --services | ForEach-Object {
                $health = docker inspect --format='{{.State.Health.Status}}' "${_}_1" 2>$null
                if ($health) {
                    Write-Info "  $_ : $health"
                }
                else {
                    Write-Info "  $_ : running"
                }
            }
        }
        "k8s" {
            Write-Info "Kubernetes status:"
            kubectl get pods -n $script:Config.Namespace
            kubectl get svc -n $script:Config.Namespace
        }
    }
}

function Show-Logs {
    param([string]$Service = "all", [int]$Lines = 50)

    Write-Step "Showing logs (last $Lines lines)"

    switch ($Mode) {
        "docker" {
            if ($Service -eq "all") {
                docker-compose logs --tail=$Lines
            }
            else {
                docker-compose logs --tail=$Lines $Service
            }
        }
        "k8s" {
            $pods = kubectl get pods -n $script:Config.Namespace -l app=$($script:Config.AppName) -o jsonpath='{.items[*].metadata.name}'
            foreach ($pod in $pods.Split(' ')) {
                if ($pod) {
                    Write-Info "Logs from pod: $pod"
                    kubectl logs $pod -n $script:Config.Namespace --tail=$Lines
                }
            }
        }
    }
}

function Clean-Deployment {
    Write-Step "Cleaning up deployment..."

    switch ($Mode) {
        "local" {
            Get-Process | Where-Object { $_.ProcessName -match "uvicorn|node" } | Stop-Process -Force -ErrorAction SilentlyContinue
            Write-Success "Local processes stopped"
        }
        "docker" {
            docker-compose down --remove-orphans --volumes
            Write-Success "Docker Compose services stopped and removed"
        }
        "k8s" {
            kubectl delete namespace $script:Config.Namespace --ignore-not-found=true
            Write-Success "Kubernetes resources cleaned up"
        }
    }
}

# Main execution
function Main {
    Write-Host "🚀 PayRox Refactor Studio Deployment" -ForegroundColor Magenta
    Write-Host "Mode: $Mode | Environment: $Environment | Platform: $Platform" -ForegroundColor Cyan
    Write-Host ""

    Test-Prerequisites
    Build-Application

    switch ($Mode) {
        "local" { Deploy-Local }
        "docker" { Deploy-Docker }
        "k8s" { Deploy-Kubernetes }
        "cloud" {
            Write-Warning "Cloud deployment mode selected but not implemented in this script"
            Write-Info "Please use your cloud provider's deployment tools (Azure DevOps, AWS CodeDeploy, etc.)"
            exit 1
        }
    }

    Write-Host ""
    Show-Status

    Write-Host ""
    Write-Success "🎉 PayRox Refactor Studio deployment complete!"
    Write-Info "Access the web interface to start refactoring operations"
    Write-Info "Use './deploy.ps1 -Mode $Mode -Environment $Environment' to redeploy"
    Write-Info "Use 'docker-compose logs -f' (Docker) or 'kubectl logs -f deployment/$($script:Config.AppName) -n $($script:Config.Namespace)' (K8s) to view logs"
}

# Handle script arguments
if ($args -contains "-logs") {
    Show-Logs
    exit 0
}

if ($args -contains "-status") {
    Show-Status
    exit 0
}

if ($args -contains "-clean") {
    Clean-Deployment
    exit 0
}

# Run main deployment
Main
