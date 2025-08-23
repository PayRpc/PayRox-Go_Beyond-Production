param(
    [switch]$Strict,              # fail if any core file missing
    [switch]$VerifySums = $true,  # verify SHA256SUMS by default
    [string]$OutDir = "./split-output"
)

$ErrorActionPreference = "Stop"
$core = @(
    "manifest.root.json",
    "proofs.json",
    "deployment-plan.json",
    "selectors.json"
)

Write-Host "`n📂 ARTIFACT LOCATIONS:" -ForegroundColor Magenta
Write-Host "=====================" -ForegroundColor Magenta
Write-Host "Main Artifacts Folder: $OutDir`n" -ForegroundColor Cyan

# Core file existence
Write-Host "Core Deployment Files:" -ForegroundColor White
$missing = @()
foreach ($f in $core) {
    $p = Join-Path $OutDir $f
    if (Test-Path $p) { Write-Host "  ✅ $f" }
    else { Write-Host "  ❌ $f (missing)" -ForegroundColor Red; $missing += $f }
}
if ($Strict -and $missing.Count -gt 0) {
    Write-Error "Missing core artifacts: $($missing -join ', ')"
    exit 1
}

Write-Host "`nValidation Files:" -ForegroundColor White
("codehashes-predictive-*.json", "codehashes-observed-*.json", "deployment-results.json", "orchestration-plan.json", "SHA256SUMS") |
ForEach-Object {
    $p = Join-Path $OutDir $_
    $ok = @(Get-ChildItem -Path $p -ErrorAction SilentlyContinue).Count -gt 0
    Write-Host ("  {0} {1}" -f ($ok ? "✅" : "⏳"), $_)
}

Write-Host "`nSecurity Files (generated when Mythril/Docker is available):" -ForegroundColor White
("mythril-src.latest.json", "mythril-addr.latest.json", "mythril-src.sarif", "mythril-addr.sarif") |
ForEach-Object {
    $p = Join-Path $OutDir $_
    $ok = @(Get-ChildItem -Path $p -ErrorAction SilentlyContinue).Count -gt 0
    Write-Host ("  {0} {1}" -f ($ok ? "✅" : "⏳"), $_)
}

Write-Host "`nGovernance Files (optional):" -ForegroundColor White
("commit-result.json", "apply-result.json", "manifest.sig.json") |
ForEach-Object {
    $p = Join-Path $OutDir $_
    $ok = @(Get-ChildItem -Path $p -ErrorAction SilentlyContinue).Count -gt 0
    Write-Host ("  {0} {1}" -f ($ok ? "✅" : "⏳"), $_)
}

Write-Host "`nSource Files:" -ForegroundColor White
Write-Host "  📄 contracts/test/PayRoxDemo.sol"
Write-Host "  📁 contracts/facets-fixed/"

# SHA256SUMS verification
$sumFile = Join-Path $OutDir "SHA256SUMS"
if ($VerifySums -and (Test-Path $sumFile)) {
    Write-Host "`n🔐 Verifying SHA256SUMS..." -ForegroundColor Yellow
    $bad = @()
    Get-Content $sumFile | ForEach-Object {
        if ($_ -match '^\s*([0-9a-fA-F]{64})\s+\*?(.+)$') {
            $hash = $Matches[1].ToLower()
            $file = $Matches[2] -replace '\\', '/'  # Normalize path separators
            $fullPath = Join-Path $OutDir (Split-Path $file -Leaf)
            if (Test-Path $fullPath) {
                $actual = (Get-FileHash -Algorithm SHA256 -Path $fullPath).Hash.ToLower()
                if ($actual -ne $hash) { $bad += $file; Write-Host "  ❌ $file (hash mismatch)" -ForegroundColor Red }
                else { Write-Host "  ✅ $file" }
            }
            else { $bad += $file; Write-Host "  ❌ $file (missing)" -ForegroundColor Red }
        }
    }
    if ($bad.Count -gt 0) {
        Write-Error "SHA256SUMS mismatch/missing: $($bad -join ', ')"
        exit 1
    }
    Write-Host "✅ SHA256SUMS verified." -ForegroundColor Green
}
elseif ($VerifySums) {
    Write-Host "`n⚠️  SHA256SUMS not found for verification" -ForegroundColor Yellow
}

Write-Host "`n✅ Artifact check completed." -ForegroundColor Green
