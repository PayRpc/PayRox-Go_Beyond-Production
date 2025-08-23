param([string]$OutDir = "./split-output")

function Test-Any([string]$pattern) {
    $p = Join-Path $OutDir $pattern
    return @(Get-ChildItem -Path $p -ErrorAction SilentlyContinue).Count -gt 0
}

$must = @(
    "manifest.root.json", "proofs.json", "deployment-plan.json", "selectors.json"
)

Write-Host "`n📂 ARTIFACT LOCATIONS:" -ForegroundColor Magenta
Write-Host "=====================" -ForegroundColor Magenta
Write-Host "`nMain Artifacts Folder: $OutDir" -ForegroundColor Cyan

Write-Host "`nCore Deployment Files:" -ForegroundColor White
$must | ForEach-Object { $ok = Test-Any $_; Write-Host ("  {0} {1}" -f ($ok ? "✅" : "⚠️ "), $_) }

Write-Host "`nValidation Files:" -ForegroundColor White
("codehashes-predictive-*.json", "codehashes-observed-*.json", "deployment-results.json", "orchestration-plan.json", "SHA256SUMS") |
ForEach-Object { $ok = Test-Any $_; Write-Host ("  {0} {1}" -f ($ok ? "✅" : "⏳"), $_) }

Write-Host "`nSecurity Files (require Docker/Mythril):" -ForegroundColor White
("mythril-src.latest.json", "mythril-addr.latest.json", "mythril-src.sarif", "mythril-addr.sarif") |
ForEach-Object { $ok = Test-Any $_; Write-Host ("  {0} {1}" -f ($ok ? "✅" : "⏳"), $_) }

Write-Host "`nGovernance Files (optional):" -ForegroundColor White
("commit-result.json", "apply-result.json", "manifest.sig.json") |
ForEach-Object { $ok = Test-Any $_; Write-Host ("  {0} {1}" -f ($ok ? "✅" : "⏳"), $_) }

Write-Host "`nSource Files:" -ForegroundColor White
Write-Host "  📄 contracts/test/PayRoxDemo.sol"
Write-Host "  📁 contracts/facets-fixed/"

# Optional: fail if any must-have is missing
if (-not ($must | ForEach-Object { Test-Any $_ } | Where-Object { -not $_ } | Measure-Object).Count -eq 0) {
    Write-Host "`n❌ Missing core artifacts." -ForegroundColor Red
    exit 1
}
Write-Host "`n✅ Artifact check completed." -ForegroundColor Green
