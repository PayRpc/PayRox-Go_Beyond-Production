#!/usr/bin/env pwsh
# PayRox Stability Monitor and Auto-Backup System
# Prevents data loss and maintains development workflow

param(
    [switch]$Setup,
    [switch]$Monitor,
    [switch]$Backup,
    [switch]$Restore,
    [string]$RestoreFile = ""
)

$ProjectRoot = "C:\PayRox-Clean"
$BackupDir = "$ProjectRoot\.stability\backups"
$LogFile = "$ProjectRoot\.stability\stability.log"
$ConfigFile = "$ProjectRoot\.stability\config.json"

function Write-StabilityLog {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    Write-Host $logEntry -ForegroundColor $(if ($Level -eq "ERROR") { "Red" } elseif ($Level -eq "WARN") { "Yellow" } else { "Green" })
    Add-Content -Path $LogFile -Value $logEntry -Force
}

function Initialize-StabilitySystem {
    Write-Host "🔧 Initializing PayRox Stability System..." -ForegroundColor Cyan

    # Create stability directories
    $dirs = @(".stability", ".stability\backups", ".stability\temp", ".stability\logs")
    foreach ($dir in $dirs) {
        $fullPath = Join-Path $ProjectRoot $dir
        if (!(Test-Path $fullPath)) {
            New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
            Write-StabilityLog "Created directory: $dir"
        }
    }

    # Create configuration
    $config = @{
        backupInterval = 300  # 5 minutes
        maxBackups     = 20
        watchPaths     = @(
            "contracts/**/*.sol",
            "scripts/**/*.js",
            "scripts/**/*.ts",
            "test/**/*.ts",
            "tests/**/*.ts",
            "tools/**/*.js",
            "tools/**/*.ts",
            "*.json",
            "*.md"
        )
        excludePaths   = @(
            "node_modules/**",
            "cache/**",
            "artifacts/**",
            "lib/**",
            ".git/**",
            "typechain-types/**"
        )
        criticalFiles  = @(
            "package.json",
            "hardhat.config.ts",
            "tsconfig.json",
            "foundry.toml"
        )
    } | ConvertTo-Json -Depth 3

    Set-Content -Path $ConfigFile -Value $config -Force
    Write-StabilityLog "Configuration created"

    # Setup git hooks for automatic commits
    $gitHookPath = "$ProjectRoot\.git\hooks\pre-commit"
    $gitHook = @"
#!/bin/sh
# Auto-backup before commit
pwsh -File "$ProjectRoot\stability-system.ps1" -Backup
"@
    Set-Content -Path $gitHookPath -Value $gitHook -Force
    Write-StabilityLog "Git hooks configured"

    # Create gitignore entries for stability system
    $gitignorePath = "$ProjectRoot\.gitignore"
    $stabilityIgnore = @"

# PayRox Stability System
.stability/
"@
    if (Test-Path $gitignorePath) {
        $content = Get-Content $gitignorePath -Raw
        if ($content -notmatch "\.stability/") {
            Add-Content -Path $gitignorePath -Value $stabilityIgnore
        }
    }
    else {
        Set-Content -Path $gitignorePath -Value $stabilityIgnore
    }

    Write-Host "✅ PayRox Stability System initialized successfully!" -ForegroundColor Green
    Write-StabilityLog "System initialization completed"
}

function Start-AutoBackup {
    $config = Get-Content $ConfigFile | ConvertFrom-Json
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $backupPath = "$BackupDir\backup_$timestamp"

    Write-StabilityLog "Starting auto-backup to: $backupPath"

    # Create backup directory
    New-Item -ItemType Directory -Path $backupPath -Force | Out-Null

    # Backup critical files
    foreach ($pattern in $config.watchPaths) {
        $files = Get-ChildItem -Path $ProjectRoot -Include ($pattern -replace '\*\*/') -Recurse -File |
        Where-Object { $_.Length -gt 0 -and $_.FullName -notmatch "node_modules|cache|artifacts|lib|\.git" }

        foreach ($file in $files) {
            $relativePath = $file.FullName.Replace($ProjectRoot, "").TrimStart('\')
            $backupFilePath = Join-Path $backupPath $relativePath
            $backupFileDir = Split-Path $backupFilePath -Parent

            if (!(Test-Path $backupFileDir)) {
                New-Item -ItemType Directory -Path $backupFileDir -Force | Out-Null
            }

            Copy-Item $file.FullName $backupFilePath -Force
        }
    }

    # Cleanup old backups
    $backups = Get-ChildItem $BackupDir -Directory | Sort-Object Name -Descending
    if ($backups.Count -gt $config.maxBackups) {
        $toDelete = $backups | Select-Object -Skip $config.maxBackups
        foreach ($backup in $toDelete) {
            Remove-Item $backup.FullName -Recurse -Force
            Write-StabilityLog "Cleaned up old backup: $($backup.Name)"
        }
    }

    # Create manifest
    $manifest = @{
        timestamp = $timestamp
        fileCount = (Get-ChildItem $backupPath -Recurse -File).Count
        totalSize = (Get-ChildItem $backupPath -Recurse -File | Measure-Object Length -Sum).Sum
        gitCommit = (git rev-parse HEAD 2>$null)
    } | ConvertTo-Json -Depth 2

    Set-Content -Path "$backupPath\manifest.json" -Value $manifest
    Write-StabilityLog "Auto-backup completed: $($manifest | ConvertFrom-Json | Select-Object fileCount, totalSize)"
}

function Start-SystemMonitor {
    Write-Host "🔍 Starting PayRox System Monitor..." -ForegroundColor Cyan
    Write-StabilityLog "System monitor started"

    $config = Get-Content $ConfigFile | ConvertFrom-Json
    $lastBackup = Get-Date

    while ($true) {
        try {
            # Check for empty files
            $emptyFiles = Get-ChildItem -Path $ProjectRoot -Include "*.sol", "*.ts", "*.js", "*.md" -Recurse |
            Where-Object { $_.Length -eq 0 -and $_.FullName -notmatch "node_modules|cache|artifacts|lib|\.git" }

            if ($emptyFiles.Count -gt 0) {
                Write-StabilityLog "WARNING: Found $($emptyFiles.Count) empty files!" "WARN"
                foreach ($file in $emptyFiles) {
                    Write-StabilityLog "Empty file detected: $($file.FullName)" "WARN"
                }

                # Trigger immediate restore attempt
                & $PSCommandPath -Restore
            }

            # Check if backup is needed
            if ((Get-Date) - $lastBackup -gt [TimeSpan]::FromSeconds($config.backupInterval)) {
                Start-AutoBackup
                $lastBackup = Get-Date
            }

            # Check VS Code processes
            $vscodeProcesses = Get-Process code -ErrorAction SilentlyContinue
            if ($vscodeProcesses.Count -eq 0) {
                Write-StabilityLog "VS Code not running - monitoring paused"
                Start-Sleep 30
                continue
            }

            # Monitor memory usage
            $totalMemory = ($vscodeProcesses | Measure-Object WorkingSet64 -Sum).Sum / 1MB
            if ($totalMemory -gt 2000) {
                # Over 2GB
                Write-StabilityLog "High memory usage detected: $([math]::Round($totalMemory, 2)) MB" "WARN"
            }

            Start-Sleep 10
        }
        catch {
            Write-StabilityLog "Monitor error: $($_.Exception.Message)" "ERROR"
            Start-Sleep 30
        }
    }
}

function Restore-FromBackup {
    param([string]$BackupName = "")

    if ($BackupName -eq "") {
        $backups = Get-ChildItem $BackupDir -Directory | Sort-Object Name -Descending
        if ($backups.Count -eq 0) {
            Write-StabilityLog "No backups available for restore" "ERROR"
            return
        }
        $BackupName = $backups[0].Name
    }

    $backupPath = "$BackupDir\$BackupName"
    if (!(Test-Path $backupPath)) {
        Write-StabilityLog "Backup not found: $BackupName" "ERROR"
        return
    }

    Write-Host "🔄 Restoring from backup: $BackupName" -ForegroundColor Yellow
    Write-StabilityLog "Starting restore from: $BackupName"

    # Check for empty files first
    $emptyFiles = Get-ChildItem -Path $ProjectRoot -Include "*.sol", "*.ts", "*.js", "*.md" -Recurse |
    Where-Object { $_.Length -eq 0 -and $_.FullName -notmatch "node_modules|cache|artifacts|lib|\.git" }

    $restoredCount = 0
    foreach ($emptyFile in $emptyFiles) {
        $relativePath = $emptyFile.FullName.Replace($ProjectRoot, "").TrimStart('\')
        $backupFile = Join-Path $backupPath $relativePath

        if (Test-Path $backupFile) {
            Copy-Item $backupFile $emptyFile.FullName -Force
            Write-StabilityLog "Restored: $relativePath"
            $restoredCount++
        }
    }

    Write-Host "✅ Restore completed: $restoredCount files restored" -ForegroundColor Green
    Write-StabilityLog "Restore completed: $restoredCount files restored"
}

# Main execution
switch ($true) {
    $Setup { Initialize-StabilitySystem }
    $Monitor { Start-SystemMonitor }
    $Backup { Start-AutoBackup }
    $Restore { Restore-FromBackup -BackupName $RestoreFile }
    default {
        Write-Host @"
PayRox Stability System
======================

Usage:
  .\stability-system.ps1 -Setup      Initialize the stability system
  .\stability-system.ps1 -Monitor    Start continuous monitoring
  .\stability-system.ps1 -Backup     Create immediate backup
  .\stability-system.ps1 -Restore    Restore from latest backup
  .\stability-system.ps1 -Restore -RestoreFile "backup_name"

Examples:
  .\stability-system.ps1 -Setup
  .\stability-system.ps1 -Monitor
  .\stability-system.ps1 -Restore -RestoreFile "backup_20250821_143022"
"@
    }
}
