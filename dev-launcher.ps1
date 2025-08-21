#!/usr/bin/env pwsh
# PayRox Development Launcher - One-Click Stable Development Environment

param(
    [switch]$Start,
    [switch]$Stop,
    [switch]$Status,
    [switch]$Emergency
)

$ProjectRoot = "C:\PayRox-Clean"
$MonitorJob = $null

function Write-DevLog {
    param([string]$Message, [string]$Color = "Green")
    $timestamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[$timestamp] $Message" -ForegroundColor $Color
}

function Start-PayRoxDevelopment {
    Write-Host "🚀 Starting PayRox Stable Development Environment..." -ForegroundColor Cyan

    # Ensure we're in the right directory
    Set-Location $ProjectRoot

    # Check if stability system is initialized
    if (!(Test-Path ".stability\config.json")) {
        Write-DevLog "Initializing stability system..." "Yellow"
        & .\stability-system.ps1 -Setup
    }

    # Create immediate backup
    Write-DevLog "Creating safety backup..."
    & .\stability-system.ps1 -Backup

    # Start monitoring in background job
    Write-DevLog "Starting file monitoring..."
    $Global:MonitorJob = Start-Job -ScriptBlock {
        Set-Location $using:ProjectRoot
        & .\stability-system.ps1 -Monitor
    }

    Write-DevLog "Monitor Job ID: $($Global:MonitorJob.Id)"

    # Check for any existing issues
    $emptyFiles = Get-ChildItem -Path $ProjectRoot -Include "*.sol", "*.ts", "*.js", "*.md" -Recurse |
    Where-Object { $_.Length -eq 0 -and $_.FullName -notmatch "node_modules|cache|artifacts|lib|\.git" }

    if ($emptyFiles.Count -gt 0) {
        Write-DevLog "Found $($emptyFiles.Count) empty files - fixing..." "Yellow"
        & .\stability-system.ps1 -Restore
    }

    Write-Host @"

✅ PayRox Development Environment READY!

🛡️  Auto-save: Every 1 second
📦  Backups: Every 5 minutes
🔍  Monitoring: Active (Job $($Global:MonitorJob.Id))
🔄  Recovery: Instant restore available
⚡  VS Code: Crash-resistant configuration

Commands:
  .\dev-launcher.ps1 -Status     Check system status
  .\dev-launcher.ps1 -Stop       Stop monitoring
  .\dev-launcher.ps1 -Emergency  Emergency recovery

🎯 You can now work safely without fear of data loss!
"@ -ForegroundColor Green
}

function Stop-PayRoxDevelopment {
    Write-Host "🔄 Stopping PayRox Development Environment..." -ForegroundColor Yellow

    # Stop monitoring job
    if ($Global:MonitorJob) {
        Stop-Job $Global:MonitorJob -Force
        Remove-Job $Global:MonitorJob -Force
        Write-DevLog "Monitoring stopped"
    }

    # Get all background jobs for stability monitoring
    $jobs = Get-Job | Where-Object { $_.Command -like "*stability-system*" -or $_.Name -like "*Monitor*" }
    foreach ($job in $jobs) {
        Stop-Job $job -Force
        Remove-Job $job -Force
        Write-DevLog "Stopped job: $($job.Id)"
    }

    # Final backup
    Write-DevLog "Creating final backup..."
    & .\stability-system.ps1 -Backup

    Write-Host "✅ Development environment safely stopped" -ForegroundColor Green
}

function Show-SystemStatus {
    Write-Host "📊 PayRox Development Environment Status" -ForegroundColor Cyan
    Write-Host "=" * 50

    # Check monitoring jobs
    $jobs = Get-Job | Where-Object { $_.Command -like "*stability-system*" -or $_.Name -like "*Monitor*" }
    if ($jobs.Count -gt 0) {
        Write-DevLog "🟢 Monitoring: ACTIVE ($($jobs.Count) jobs running)"
        foreach ($job in $jobs) {
            Write-Host "   Job $($job.Id): $($job.State)" -ForegroundColor Gray
        }
    }
    else {
        Write-DevLog "🔴 Monitoring: NOT RUNNING" "Red"
    }

    # Check recent backups
    if (Test-Path ".stability\backups") {
        $backups = Get-ChildItem ".stability\backups" -Directory | Sort-Object Name -Descending | Select-Object -First 3
        Write-DevLog "📦 Recent Backups: $($backups.Count) available"
        foreach ($backup in $backups) {
            Write-Host "   $($backup.Name)" -ForegroundColor Gray
        }
    }

    # Check for empty files
    $emptyFiles = Get-ChildItem -Path $ProjectRoot -Include "*.sol", "*.ts", "*.js", "*.md" -Recurse |
    Where-Object { $_.Length -eq 0 -and $_.FullName -notmatch "node_modules|cache|artifacts|lib|\.git" }

    if ($emptyFiles.Count -eq 0) {
        Write-DevLog "✅ File Integrity: ALL FILES OK"
    }
    else {
        Write-DevLog "⚠️  File Integrity: $($emptyFiles.Count) empty files detected" "Yellow"
    }

    # Check VS Code processes
    $vscode = Get-Process code -ErrorAction SilentlyContinue
    if ($vscode) {
        $memory = ($vscode | Measure-Object WorkingSet64 -Sum).Sum / 1MB
        Write-DevLog "💻 VS Code: Running ($([math]::Round($memory, 1)) MB)"
    }
    else {
        Write-DevLog "💻 VS Code: Not running"
    }

    # Show recent log entries
    if (Test-Path ".stability\stability.log") {
        Write-Host "`n📋 Recent Activity:" -ForegroundColor Cyan
        Get-Content ".stability\stability.log" -Tail 5 | ForEach-Object {
            Write-Host "   $_" -ForegroundColor Gray
        }
    }
}

function Emergency-Recovery {
    Write-Host "🚨 EMERGENCY RECOVERY MODE" -ForegroundColor Red
    Write-Host "=" * 50

    # Stop all monitoring
    Get-Job | Where-Object { $_.Command -like "*stability-system*" } | Stop-Job -Force
    Get-Job | Where-Object { $_.Command -like "*stability-system*" } | Remove-Job -Force

    # Immediate restore
    Write-DevLog "Restoring from latest backup..." "Yellow"
    & .\stability-system.ps1 -Restore

    # Check results
    $emptyFiles = Get-ChildItem -Path $ProjectRoot -Include "*.sol", "*.ts", "*.js", "*.md" -Recurse |
    Where-Object { $_.Length -eq 0 -and $_.FullName -notmatch "node_modules|cache|artifacts|lib|\.git" }

    if ($emptyFiles.Count -eq 0) {
        Write-Host "✅ RECOVERY SUCCESSFUL - All files restored" -ForegroundColor Green
    }
    else {
        Write-Host "⚠️  $($emptyFiles.Count) files still need attention" -ForegroundColor Yellow
        $emptyFiles | ForEach-Object { Write-Host "   $($_.FullName)" -ForegroundColor Red }
    }

    # Restart monitoring
    Write-DevLog "Restarting monitoring..."
    Start-PayRoxDevelopment
}

# Main execution
switch ($true) {
    $Start { Start-PayRoxDevelopment }
    $Stop { Stop-PayRoxDevelopment }
    $Status { Show-SystemStatus }
    $Emergency { Emergency-Recovery }
    default {
        Write-Host @"
PayRox Development Launcher
===========================

🚀 ONE-CLICK STABLE DEVELOPMENT ENVIRONMENT

Commands:
  .\dev-launcher.ps1 -Start      Start protected development environment
  .\dev-launcher.ps1 -Stop       Stop monitoring and create final backup
  .\dev-launcher.ps1 -Status     Check system health and activity
  .\dev-launcher.ps1 -Emergency  Emergency recovery and restart

Quick Start:
  .\dev-launcher.ps1 -Start

This will:
✅ Initialize crash prevention
✅ Start auto-save (1 second intervals)
✅ Begin automatic backups (5 minute intervals)
✅ Monitor for empty files and corruption
✅ Enable instant recovery capabilities

Work normally in VS Code - everything is protected!
"@ -ForegroundColor Cyan
    }
}
