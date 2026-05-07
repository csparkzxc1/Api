#Requires -Version 5.1
<#
.SYNOPSIS
  Rename PulseWatch -> Cap across the monorepo (PowerShell version).

.DESCRIPTION
  Run from repo root in PowerShell. Modes: --dry-run, --apply, --verify.
  Equivalent to rename-to-cap.sh but native to Windows PowerShell.

.EXAMPLE
  .\rename-to-cap.ps1 --dry-run
  .\rename-to-cap.ps1 --apply
  .\rename-to-cap.ps1 --verify

.NOTES
  If you get "execution policy" errors, run this first in the same session:
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#>

[CmdletBinding()]
param(
  [Parameter(Position=0)]
  [string]$Mode = ""
)

$ErrorActionPreference = 'Stop'

# ============================================================
# CONFIG — edit these if your naming choices differ
# ============================================================
$OldLower  = "pulsewatch"
$NewLower  = "cap"
$OldPascal = "PulseWatch"
$NewPascal = "Cap"
$OldUpper  = "PULSEWATCH"
$NewUpper  = "CAP"
# npm scope — using @cap-app to avoid potential collision on @cap
$OldScope  = "@pulsewatch"
$NewScope  = "@cap-app"
# Bundle ID prefix — using com.capapp to avoid collision with com.cap
$OldBundle = "com.pulsewatch"
$NewBundle = "com.capapp"

# ============================================================
# FILE FILTERS
# ============================================================
$TextExtensions = @(
  '*.json','*.yaml','*.yml','*.toml',
  '*.ts','*.tsx','*.js','*.jsx','*.mjs','*.cjs',
  '*.kt','*.kts','*.java',
  '*.swift','*.m','*.h',
  '*.rs',
  '*.gradle','*.gradle.kts','*.properties',
  '*.xml','*.plist','*.entitlements','*.pbxproj','*.xcconfig',
  '*.md','*.mdx','*.txt',
  '*.html','*.css','*.scss',
  '*.sh','*.bash','*.zsh',
  '*.env','*.env.example',
  'Dockerfile','docker-compose.yml','fly.toml','Cargo.toml','Cargo.lock'
)

$ExcludePattern = '\\(\.git|node_modules|target|build|\.gradle|\.idea|DerivedData|Pods|dist|\.next|\.turbo|\.pnpm-store)\\'

# Order matters: scope -> bundle -> UPPER -> Pascal -> lower
# (so "@pulsewatch/" doesn't accidentally become "@cap/" before scope rule applies)
$Replacements = @(
  @{ From = "$OldScope/"; To = "$NewScope/"; Label = "npm scope ($OldScope -> $NewScope)" },
  @{ From = $OldBundle;  To = $NewBundle;   Label = "bundle ID ($OldBundle -> $NewBundle)" },
  @{ From = $OldUpper;   To = $NewUpper;    Label = "UPPERCASE ($OldUpper -> $NewUpper)" },
  @{ From = $OldPascal;  To = $NewPascal;   Label = "PascalCase ($OldPascal -> $NewPascal)" },
  @{ From = $OldLower;   To = $NewLower;    Label = "lowercase ($OldLower -> $NewLower)" }
)

# ============================================================
# HELPERS
# ============================================================
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Get-TextFiles {
  Get-ChildItem -Path . -Recurse -File -Include $TextExtensions -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch $ExcludePattern }
}

function Test-FileContains {
  param([string]$Path, [string[]]$Patterns)
  try {
    $content = [System.IO.File]::ReadAllText($Path, $Utf8NoBom)
    foreach ($p in $Patterns) {
      if ($content.Contains($p)) { return $true }
    }
    return $false
  } catch {
    return $false
  }
}

function Replace-InFile {
  param([string]$Path, [string]$From, [string]$To)
  try {
    $content = [System.IO.File]::ReadAllText($Path, $Utf8NoBom)
    if ($content.Contains($From)) {
      $newContent = $content.Replace($From, $To)
      [System.IO.File]::WriteAllText($Path, $newContent, $Utf8NoBom)
      return $true
    }
    return $false
  } catch {
    return $false
  }
}

function Get-MatchingFsItems {
  Get-ChildItem -Recurse -ErrorAction SilentlyContinue |
    Where-Object {
      ($_.Name -like "*$OldLower*" -or $_.Name -like "*$OldPascal*") -and
      $_.FullName -notmatch $ExcludePattern
    }
}

# ============================================================
# DRY RUN
# ============================================================
function Invoke-DryRun {
  Write-Host ""
  Write-Host "=== DRY RUN ===" -ForegroundColor Blue
  Write-Host ""

  Write-Host "Files containing references to rename:" -ForegroundColor Yellow
  $patterns = @($OldLower, $OldPascal, $OldUpper)
  $matched = @()
  foreach ($f in Get-TextFiles) {
    if (Test-FileContains -Path $f.FullName -Patterns $patterns) {
      $matched += $f.FullName
    }
  }

  if ($matched.Count -eq 0) {
    Write-Host "  (none found)" -ForegroundColor DarkGray
  } else {
    $matched | Select-Object -First 50 | ForEach-Object {
      Write-Host "  $_"
    }
    if ($matched.Count -gt 50) {
      Write-Host "  ... and $($matched.Count - 50) more" -ForegroundColor DarkGray
    }
  }
  Write-Host ""

  Write-Host "Replacements that will be applied (in order):" -ForegroundColor Yellow
  foreach ($r in $Replacements) {
    Write-Host "  $($r.Label)" -ForegroundColor DarkGray
  }
  Write-Host ""

  Write-Host "Folders/files that would be renamed:" -ForegroundColor Yellow
  $items = Get-MatchingFsItems
  if ($items) {
    $items | ForEach-Object { Write-Host "  $($_.FullName)" }
  } else {
    Write-Host "  (none found)" -ForegroundColor DarkGray
  }
  Write-Host ""

  Write-Host "Run with --apply to perform changes." -ForegroundColor Green
}

# ============================================================
# APPLY
# ============================================================
function Invoke-Apply {
  Write-Host ""
  Write-Host "=== APPLYING RENAME ===" -ForegroundColor Blue
  Write-Host ""

  if (-not (Test-Path '.git')) {
    Write-Host "Error: Run this from the repo root." -ForegroundColor Red
    exit 1
  }

  $status = & git status --porcelain 2>$null
  if ($status) {
    Write-Host "Error: Working tree is dirty. Commit or stash first." -ForegroundColor Red
    & git status --short
    exit 1
  }

  Write-Host "About to rename PulseWatch -> Cap across the entire repo." -ForegroundColor Yellow
  Write-Host "A new branch 'rename/cap' will be created."
  $confirm = Read-Host "Continue? [y/N]"
  if ($confirm -notmatch '^[Yy]') { exit 1 }

  & git checkout -b rename/cap 2>$null
  if ($LASTEXITCODE -ne 0) {
    & git checkout rename/cap
  }

  $files = Get-TextFiles | ForEach-Object { $_.FullName }

  $i = 1
  $total = $Replacements.Count
  foreach ($r in $Replacements) {
    Write-Host "[$i/$total] $($r.Label)" -ForegroundColor Yellow
    $changed = 0
    foreach ($f in $files) {
      if (Replace-InFile -Path $f -From $r.From -To $r.To) {
        $changed++
      }
    }
    Write-Host "       $changed file(s) modified" -ForegroundColor DarkGray
    $i++
  }

  # Rename folders (deepest first — sort by path length descending)
  Write-Host ""
  Write-Host "[+] Renaming folders..." -ForegroundColor Yellow
  $dirs = Get-ChildItem -Recurse -Directory -ErrorAction SilentlyContinue |
    Where-Object {
      ($_.Name -like "*$OldLower*" -or $_.Name -like "*$OldPascal*") -and
      $_.FullName -notmatch $ExcludePattern
    } |
    Sort-Object { $_.FullName.Length } -Descending

  foreach ($d in $dirs) {
    if (Test-Path -LiteralPath $d.FullName) {
      $newName = $d.Name.Replace($OldPascal, $NewPascal).Replace($OldLower, $NewLower)
      if ($d.Name -ne $newName) {
        $newPath = Join-Path $d.Parent.FullName $newName
        Write-Host "  $($d.FullName) -> $newPath"
        & git mv $d.FullName $newPath 2>$null
        if ($LASTEXITCODE -ne 0) { Move-Item -LiteralPath $d.FullName -Destination $newPath }
      }
    }
  }

  # Rename files
  Write-Host "[+] Renaming files..." -ForegroundColor Yellow
  $matchingFiles = Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
      ($_.Name -like "*$OldLower*" -or $_.Name -like "*$OldPascal*") -and
      $_.FullName -notmatch $ExcludePattern
    }

  foreach ($f in $matchingFiles) {
    if (Test-Path -LiteralPath $f.FullName) {
      $newName = $f.Name.Replace($OldPascal, $NewPascal).Replace($OldLower, $NewLower)
      if ($f.Name -ne $newName) {
        $newPath = Join-Path $f.Directory.FullName $newName
        Write-Host "  $($f.FullName) -> $newPath"
        & git mv $f.FullName $newPath 2>$null
        if ($LASTEXITCODE -ne 0) { Move-Item -LiteralPath $f.FullName -Destination $newPath }
      }
    }
  }

  Write-Host ""
  Write-Host "=== RENAME COMPLETE ===" -ForegroundColor Green
  Write-Host ""
  Show-NextSteps
}

function Show-NextSteps {
  Write-Host "Next steps:" -ForegroundColor Yellow
  Write-Host "  1. Run: .\rename-to-cap.ps1 --verify"
  Write-Host "  2. Reinstall deps: Remove-Item -Recurse -Force node_modules; pnpm install"
  Write-Host "  3. Run tests: pnpm test"
  Write-Host ""
  Write-Host "=== MANUAL STEPS REQUIRED ===" -ForegroundColor Red
  Write-Host ""
  Write-Host "Some renames are too risky for sed-style replacement and need IDE refactoring:"
  Write-Host ""
  Write-Host "iOS / Xcode (macOS only — cannot do on Windows):" -ForegroundColor Yellow
  Write-Host "  - Open ios/Cap.xcworkspace"
  Write-Host "  - Right-click 'PulseWatch' scheme/target -> Rename"
  Write-Host "  - Use Xcode Refactor -> Rename for any remaining Swift symbols"
  Write-Host "  - Re-sign with new bundle ID, regenerate provisioning profiles"
  Write-Host ""
  Write-Host "Android Studio:" -ForegroundColor Yellow
  Write-Host "  - Open android/ in Android Studio"
  Write-Host "  - Refactor -> Rename Package: com.pulsewatch.* -> com.capapp.*"
  Write-Host "  - Update applicationId in app/build.gradle.kts"
  Write-Host "  - Sync Gradle, rebuild"
  Write-Host ""
  Write-Host "Tauri / Rust:" -ForegroundColor Yellow
  Write-Host "  - Update tauri.conf.json identifier 'com.pulsewatch.agent' -> 'com.capapp.agent'"
  Write-Host "  - cargo clean; cargo build (Cargo.lock regen)"
  Write-Host ""
  Write-Host "Other:" -ForegroundColor Yellow
  Write-Host "  - Update GitHub repo name (Settings -> Rename, optional)"
  Write-Host "  - Update CI/CD secrets if names changed (CAP_KMS_KEY etc.)"
  Write-Host "  - Update any hardcoded URLs (cap.app instead of pulsewatch.app)"
  Write-Host "  - APNs/FCM: re-issue certificates for new bundle IDs"
  Write-Host "  - StoreConnect: create NEW app entry with new bundle ID (cannot rename existing)"
  Write-Host ""
}

# ============================================================
# VERIFY
# ============================================================
function Invoke-Verify {
  Write-Host ""
  Write-Host "=== VERIFICATION ===" -ForegroundColor Blue
  Write-Host ""

  $patterns = @($OldLower, $OldPascal, $OldUpper)
  $remaining = @()
  foreach ($f in Get-TextFiles) {
    if (Test-FileContains -Path $f.FullName -Patterns $patterns) {
      $remaining += $f.FullName
    }
  }

  if ($remaining.Count -eq 0) {
    Write-Host "[OK] No remaining references in text files." -ForegroundColor Green
  } else {
    Write-Host "[!] Remaining references found in:" -ForegroundColor Red
    $remaining | ForEach-Object { Write-Host "  $_" }
    Write-Host ""
    Write-Host "Inspect each — some may be intentional (changelogs, blog posts, comments)." -ForegroundColor DarkGray
  }

  Write-Host ""
  Write-Host "Remaining folders/files matching old name:" -ForegroundColor Yellow
  $items = Get-MatchingFsItems
  if ($items) {
    $items | ForEach-Object { Write-Host "  $($_.FullName)" }
  } else {
    Write-Host "  (none)" -ForegroundColor DarkGray
  }
}

# ============================================================
# USAGE
# ============================================================
function Show-Usage {
  Write-Host ""
  Write-Host "Usage:" -ForegroundColor Yellow
  Write-Host "  .\rename-to-cap.ps1 --dry-run    Show what would change"
  Write-Host "  .\rename-to-cap.ps1 --apply      Apply changes (creates rename/cap branch)"
  Write-Host "  .\rename-to-cap.ps1 --verify     Check no old references remain"
  Write-Host ""
  Write-Host "Variables (edit script to change):" -ForegroundColor DarkGray
  Write-Host "  $OldLower  -> $NewLower" -ForegroundColor DarkGray
  Write-Host "  $OldPascal -> $NewPascal" -ForegroundColor DarkGray
  Write-Host "  $OldUpper  -> $NewUpper" -ForegroundColor DarkGray
  Write-Host "  $OldScope  -> $NewScope" -ForegroundColor DarkGray
  Write-Host "  $OldBundle -> $NewBundle" -ForegroundColor DarkGray
  Write-Host ""
  Write-Host "If you get 'execution policy' errors, run this first:" -ForegroundColor DarkGray
  Write-Host "  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass" -ForegroundColor DarkGray
  Write-Host ""
}

# ============================================================
# MAIN
# ============================================================
$normalized = $Mode.ToLower().TrimStart('-')

switch ($normalized) {
  'dry-run' { Invoke-DryRun }
  'dryrun'  { Invoke-DryRun }
  'apply'   { Invoke-Apply }
  'verify'  { Invoke-Verify }
  default {
    Show-Usage
    exit 1
  }
}
