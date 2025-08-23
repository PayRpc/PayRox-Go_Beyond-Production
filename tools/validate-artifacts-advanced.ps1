# Advanced Artifact Validation Script
# Provides comprehensive validation including schema checks, plan consistency, and selector parity

param(
    [switch]$Strict,              # fail if any core file missing
    [switch]$VerifySums,          # verify SHA256SUMS
    [switch]$ValidateSchemas,     # validate JSON schemas (requires ajv-cli)
    [switch]$CheckConsistency,    # check plan/manifest consistency
    [switch]$CheckSelectors,      # check selector parity
    [string]$OutDir = "./split-output"
)

$ErrorActionPreference = "Stop"

# Default VerifySums to true if not explicitly set to false
if (-not $PSBoundParameters.ContainsKey('VerifySums')) {
    $VerifySums = $true
}

# Import the basic artifact checker
Write-Host "🔍 Running basic artifact validation..." -ForegroundColor Cyan
$basicArgs = @()
$basicArgs += $OutDir
if ($Strict) { $basicArgs += "-Strict" }
if ($VerifySums) { $basicArgs += "-VerifySums" }

& ".\tools\show-artifacts.ps1" @basicArgs
if ($LASTEXITCODE -ne 0) {
    Write-Error "Basic artifact validation failed"
    exit $LASTEXITCODE
}

# Schema Validation (if requested)
if ($ValidateSchemas) {
    Write-Host "`n📝 Schema Validation:" -ForegroundColor Yellow

    $schemaFiles = @(
        @{ file = "manifest.root.json"; schema = "manifest-schema.json" },
        @{ file = "deployment-plan.json"; schema = "deployment-plan-schema.json" }
    )

    foreach ($item in $schemaFiles) {
        $filePath = Join-Path $OutDir $item.file
        $schemaPath = Join-Path "schemas" $item.schema

        if (Test-Path $filePath) {
            if (Test-Path $schemaPath) {
                Write-Host "  🔍 Validating $($item.file)..." -NoNewline
                try {
                    $result = & ajv validate -s $schemaPath -d $filePath 2>&1
                    if ($LASTEXITCODE -eq 0) {
                        Write-Host " ✅" -ForegroundColor Green
                    }
                    else {
                        Write-Host " ❌ Schema validation failed" -ForegroundColor Red
                        Write-Host "    $result" -ForegroundColor Gray
                    }
                }
                catch {
                    Write-Host " ⚠️  ajv-cli not available" -ForegroundColor Yellow
                }
            }
            else {
                Write-Host "  ⚠️  Schema file $($item.schema) not found" -ForegroundColor Yellow
            }
        }
        else {
            Write-Host "  ❌ $($item.file) not found" -ForegroundColor Red
        }
    }
}

# Plan Consistency Check
if ($CheckConsistency) {
    Write-Host "`n🔗 Plan Consistency Check:" -ForegroundColor Yellow

    $manifestPath = Join-Path $OutDir "manifest.root.json"
    $planPath = Join-Path $OutDir "deployment-plan.json"

    if ((Test-Path $manifestPath) -and (Test-Path $planPath)) {
        try {
            $manifest = Get-Content $manifestPath | ConvertFrom-Json
            $plan = Get-Content $planPath | ConvertFrom-Json

            # Check Plan ID consistency
            if ($manifest.planId -and $plan.planId) {
                if ($manifest.planId -eq $plan.planId) {
                    Write-Host "  ✅ Plan ID consistency verified" -ForegroundColor Green
                }
                else {
                    Write-Host "  ❌ Plan ID mismatch: manifest($($manifest.planId)) vs plan($($plan.planId))" -ForegroundColor Red
                }
            }
            else {
                Write-Host "  ⚠️  Plan ID not found in one or both files" -ForegroundColor Yellow
            }

            # Check Merkle root consistency
            if ($manifest.merkleRoot -and $plan.merkleRoot) {
                if ($manifest.merkleRoot -eq $plan.merkleRoot) {
                    Write-Host "  ✅ Merkle root consistency verified" -ForegroundColor Green
                }
                else {
                    Write-Host "  ❌ Merkle root mismatch" -ForegroundColor Red
                }
            }
            else {
                Write-Host "  ⚠️  Merkle root not found in one or both files" -ForegroundColor Yellow
            }

        }
        catch {
            Write-Host "  ❌ Error parsing JSON files: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    else {
        Write-Host "  ❌ Required files missing for consistency check" -ForegroundColor Red
    }
}

# Selector Parity Check
if ($CheckSelectors) {
    Write-Host "`n🎯 Selector Parity Check:" -ForegroundColor Yellow

    $selectorsPath = Join-Path $OutDir "selectors.json"
    $proofsPath = Join-Path $OutDir "proofs.json"

    if ((Test-Path $selectorsPath) -and (Test-Path $proofsPath)) {
        try {
            $selectors = Get-Content $selectorsPath | ConvertFrom-Json
            $proofs = Get-Content $proofsPath | ConvertFrom-Json

            $selectorCount = ($selectors | Get-Member -MemberType NoteProperty).Count
            $proofCount = ($proofs | Get-Member -MemberType NoteProperty).Count

            Write-Host "  📊 Selector count: $selectorCount" -ForegroundColor Cyan
            Write-Host "  📊 Proof count: $proofCount" -ForegroundColor Cyan

            if ($selectorCount -eq $proofCount) {
                Write-Host "  ✅ Selector/Proof count parity verified" -ForegroundColor Green
            }
            else {
                Write-Host "  ❌ Count mismatch: selectors($selectorCount) vs proofs($proofCount)" -ForegroundColor Red
            }

            # Check expected count (71 functions as mentioned)
            $expectedCount = 71
            if ($selectorCount -eq $expectedCount) {
                Write-Host "  ✅ Expected selector count ($expectedCount) verified" -ForegroundColor Green
            }
            else {
                Write-Host "  ⚠️  Selector count ($selectorCount) differs from expected ($expectedCount)" -ForegroundColor Yellow
            }

        }
        catch {
            Write-Host "  ❌ Error parsing JSON files: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    else {
        Write-Host "  ❌ Required files missing for selector parity check" -ForegroundColor Red
    }
}

Write-Host "`n🎯 Advanced validation completed." -ForegroundColor Green
