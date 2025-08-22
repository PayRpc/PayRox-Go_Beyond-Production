# ci-validation-pipeline.ps1
# Production-ready CI/CD validation pipeline for PayRox contract splitting and deployment

param(
    [string]$FactoryAddress = $env:FACTORY_ADDRESS,
    [string]$OrchestratorAddress = $env:ORCHESTRATOR_ADDRESS,
    [string]$DispatcherAddress = $env:DISPATCHER_ADDRESS,
    [string]$ManifestPath = "./split-output/manifest.json",
    [string]$FacetsDir = "./artifacts/contracts/facets",
    [string]$Network = "localhost",
    [switch]$DryRun = $false
)

# Enable strict error handling
$ErrorActionPreference = "Stop"

# Functions for colored output
function Write-Info { param($Message) Write-Host "ℹ️  $Message" -ForegroundColor Blue }
function Write-Success { param($Message) Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Warning { param($Message) Write-Host "⚠️  $Message" -ForegroundColor Yellow }
function Write-Error { param($Message) Write-Host "❌ $Message" -ForegroundColor Red }

# Function to run JSON task and check result
function Invoke-JsonTask {
    param(
        [string]$TaskName,
        [string[]]$Arguments = @()
    )

    Write-Info "Running $TaskName..."

    try {
        $allArgs = @($TaskName, "--json") + $Arguments
        $result = npx hardhat @allArgs 2>&1 | Out-String

        if ($LASTEXITCODE -eq 0) {
            $json = $result | ConvertFrom-Json
            if ($json.ok -eq $true) {
                Write-Success "$TaskName completed successfully"
                $json | ConvertTo-Json -Depth 10
                return $true
            }
            else {
                Write-Error "$TaskName failed"
                $json | ConvertTo-Json -Depth 10
                return $false
            }
        }
        else {
            Write-Error "$TaskName execution failed"
            Write-Host $result
            return $false
        }
    }
    catch {
        Write-Error "$TaskName execution failed: $_"
        return $false
    }
}

# Step 1: Contract Splitter Validation
function Test-ContractSplitting {
    Write-Info "🔍 STEP 1: Contract Splitting Validation"
    Write-Host "========================================"

    # 1.1: Check selector parity
    Write-Info "Checking selector parity..."
    try {
        npx ts-node tools/splitter/scripts/checkParity.ts
        if ($LASTEXITCODE -ne 0) { throw "Selector parity check failed" }
        Write-Success "Selector parity validated"
    }
    catch {
        Write-Error "Selector parity check failed: $_"
        return $false
    }

    # 1.2: Check EIP-170 compliance
    Write-Info "Checking EIP-170 compliance..."
    try {
        npx ts-node tools/splitter/scripts/checkSizes.ts
        if ($LASTEXITCODE -ne 0) { throw "EIP-170 size check failed" }
        Write-Success "EIP-170 compliance validated"
    }
    catch {
        Write-Error "EIP-170 size check failed: $_"
        return $false
    }

    # 1.3: Build Merkle tree
    Write-Info "Building Merkle tree..."
    try {
        npx ts-node tools/splitter/scripts/buildMerkle.ts predictive
        if ($LASTEXITCODE -ne 0) { throw "Merkle tree generation failed" }
        Write-Success "Merkle tree generated successfully"
    }
    catch {
        Write-Error "Merkle tree generation failed: $_"
        return $false
    }

    return $true
}

# Step 2: Manifest Validation
function Test-Manifest {
    Write-Info "📋 STEP 2: Manifest Validation"
    Write-Host "==============================="

    if (!(Test-Path $ManifestPath)) {
        Write-Error "Manifest not found at $ManifestPath"
        return $false
    }

    # 2.1: Self-check manifest
    $args = @("--path", $ManifestPath)
    if (!(Invoke-JsonTask "payrox:manifest:selfcheck" $args)) {
        Write-Error "Manifest self-check failed"
        return $false
    }

    # 2.2: Check facet codehashes if deployed
    if ($Network -ne "localhost" -and $env:CHECK_DEPLOYED_FACETS -eq "true") {
        Write-Info "Checking deployed facet codehashes..."
        $args = @("--path", $ManifestPath, "--check-facets", "--network", $Network)
        if (!(Invoke-JsonTask "payrox:manifest:selfcheck" $args)) {
            Write-Error "Deployed facet codehash validation failed"
            return $false
        }
    }
    else {
        Write-Warning "Skipping deployed facet validation (localhost or CHECK_DEPLOYED_FACETS not true)"
    }

    return $true
}

# Step 3: Factory Operations
function Test-FactoryOperations {
    Write-Info "🏭 STEP 3: Factory Operations"
    Write-Host "============================="

    if ([string]::IsNullOrEmpty($FactoryAddress)) {
        Write-Warning "FactoryAddress not set, skipping factory operations"
        return $true
    }

    # Find facet files
    try {
        $facetFiles = Get-ChildItem -Path $FacetsDir -Filter "*.json" -File | Where-Object { $_.BaseName -match 'Facet$' }

        if ($facetFiles.Count -eq 0) {
            Write-Error "No facet artifacts found in $FacetsDir"
            return $false
        }

        foreach ($facetFile in $facetFiles) {
            $facetName = $facetFile.BaseName
            Write-Info "Processing $facetName..."

            # 3.1: Predict chunk address
            $args = @("--factory", $FactoryAddress, "--file", $facetFile.FullName, "--network", $Network)
            if (!(Invoke-JsonTask "payrox:chunk:predict" $args)) {
                Write-Error "Chunk prediction failed for $facetName"
                return $false
            }

            # 3.2: Stage chunk
            $args = @("--factory", $FactoryAddress, "--file", $facetFile.FullName, "--value", "0.001", "--network", $Network)
            if ($DryRun) { $args += "--dry-run" }

            if (!(Invoke-JsonTask "payrox:chunk:stage" $args)) {
                $mode = if ($DryRun) { "dry-run" } else { "staging" }
                Write-Error "Chunk $mode failed for $facetName"
                return $false
            }
        }

        Write-Success "Factory operations completed"
        return $true
    }
    catch {
        Write-Error "Factory operations failed: $_"
        return $false
    }
}

# Step 4: Orchestration
function Test-Orchestration {
    Write-Info "🎭 STEP 4: Orchestration Validation"
    Write-Host "=================================="

    if ([string]::IsNullOrEmpty($OrchestratorAddress)) {
        Write-Warning "OrchestratorAddress not set, skipping orchestration"
        return $true
    }

    try {
        # Generate plan ID from manifest hash
        $planId = "0x0000000000000000000000000000000000000000000000000000000000000001"
        if (Test-Path $ManifestPath) {
            $manifest = Get-Content $ManifestPath | ConvertFrom-Json
            if ($manifest.header.versionBytes32) {
                $planId = $manifest.header.versionBytes32
            }
        }

        $args = @("--orchestrator", $OrchestratorAddress, "--id", $planId, "--gas-limit", "1000000", "--network", $Network)
        if ($DryRun) { $args += "--dry-run" }

        if (!(Invoke-JsonTask "payrox:orchestrator:start" $args)) {
            $mode = if ($DryRun) { "dry-run" } else { "start" }
            Write-Error "Orchestration $mode failed"
            return $false
        }

        Write-Success "Orchestration validation completed"
        return $true
    }
    catch {
        Write-Error "Orchestration validation failed: $_"
        return $false
    }
}

# Step 5: Post-deployment validation
function Test-Deployment {
    Write-Info "🔍 STEP 5: Post-Deployment Validation"
    Write-Host "===================================="

    if ([string]::IsNullOrEmpty($DispatcherAddress) -or $DryRun) {
        Write-Warning "DispatcherAddress not set or dry-run mode, skipping deployment validation"
        return $true
    }

    try {
        $args = @("--dispatcher", $DispatcherAddress, "--path", $ManifestPath, "--network", $Network)
        if (!(Invoke-JsonTask "payrox:dispatcher:diff" $args)) {
            Write-Error "Deployment validation failed - routes don't match manifest"
            return $false
        }

        Write-Success "Deployment validation passed"
        return $true
    }
    catch {
        Write-Error "Deployment validation failed: $_"
        return $false
    }
}

# Step 6: Generate report
function New-ValidationReport {
    Write-Info "📊 STEP 6: Generating Validation Report"
    Write-Host "======================================"

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $reportFile = "validation-report-$timestamp.json"

    $report = @{
        timestamp           = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        network             = $Network
        dryRun              = $DryRun.IsPresent
        manifestPath        = $ManifestPath
        factoryAddress      = if ($FactoryAddress) { $FactoryAddress } else { $null }
        orchestratorAddress = if ($OrchestratorAddress) { $OrchestratorAddress } else { $null }
        dispatcherAddress   = if ($DispatcherAddress) { $DispatcherAddress } else { $null }
        steps               = @{
            contractSplitting    = $true
            manifestValidation   = $true
            factoryOperations    = ![string]::IsNullOrEmpty($FactoryAddress)
            orchestration        = ![string]::IsNullOrEmpty($OrchestratorAddress)
            deploymentValidation = (![string]::IsNullOrEmpty($DispatcherAddress) -and !$DryRun)
        }
        artifacts           = @{
            manifest       = if (Test-Path $ManifestPath) { "present" } else { "missing" }
            merkleTree     = if (Test-Path "./split-output/merkle.json") { "present" } else { "missing" }
            facetArtifacts = (Get-ChildItem -Path $FacetsDir -Filter "*.json" -ErrorAction SilentlyContinue).Count.ToString() + " files"
        }
    }

    $report | ConvertTo-Json -Depth 10 | Out-File $reportFile -Encoding UTF8
    Write-Success "Validation report generated: $reportFile"
    $report | ConvertTo-Json -Depth 10
}

# Main execution
function Main {
    Write-Info "🚀 PayRox CI/CD Validation Pipeline"
    Write-Host "===================================="
    Write-Info "Network: $Network"
    Write-Info "Dry Run: $($DryRun.IsPresent)"
    Write-Info "Manifest: $ManifestPath"
    Write-Host ""

    # Check prerequisites
    try {
        $null = Get-Command jq -ErrorAction Stop
    }
    catch {
        Write-Error "jq is required but not installed"
        exit 1
    }

    try {
        $null = Get-Command npx -ErrorAction Stop
    }
    catch {
        Write-Error "npx is required but not installed"
        exit 1
    }

    # Compile contracts
    Write-Info "Compiling contracts..."
    try {
        npx hardhat compile --network $Network
        if ($LASTEXITCODE -ne 0) { throw "Compilation failed" }
        Write-Success "Contracts compiled"
    }
    catch {
        Write-Error "Contract compilation failed: $_"
        exit 1
    }

    # Run validation steps
    try {
        if (!(Test-ContractSplitting)) { throw "Contract splitting validation failed" }
        if (!(Test-Manifest)) { throw "Manifest validation failed" }
        if (!(Test-FactoryOperations)) { throw "Factory operations failed" }
        if (!(Test-Orchestration)) { throw "Orchestration validation failed" }
        if (!(Test-Deployment)) { throw "Deployment validation failed" }
        New-ValidationReport | Out-Null

        Write-Success "🎉 All validation steps completed successfully!"
        Write-Host ""
        Write-Info "Summary:"
        Write-Host "• Contract splitting: ✅ Validated"
        Write-Host "• Manifest integrity: ✅ Verified"
        Write-Host "• Factory operations: $(if ($FactoryAddress) { '✅ Tested' } else { '⏭️  Skipped' })"
        Write-Host "• Orchestration: $(if ($OrchestratorAddress) { '✅ Validated' } else { '⏭️  Skipped' })"
        Write-Host "• Deployment: $(if ($DispatcherAddress -and !$DryRun) { '✅ Verified' } else { '⏭️  Skipped' })"
        Write-Host ""
        Write-Success "Pipeline ready for production deployment! 🚀"
    }
    catch {
        Write-Error "Pipeline failed: $_"
        exit 1
    }
}

# Execute main function
Main
