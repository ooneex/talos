#!/usr/bin/env pwsh
# talos uninstaller for Windows.
#
# Usage:
#   powershell -c "irm https://raw.githubusercontent.com/ooneex/talos/main/packages/cli/scripts/uninstall.ps1 | iex"
#
# Environment variables:
#   $env:TALOS_INSTALL   Install directory to remove (default: $HOME\.talos)

$ErrorActionPreference = "Stop"

$Binary = "talos"
$Alias = "oo"

$installDir = if ($env:TALOS_INSTALL) { $env:TALOS_INSTALL } else { "$HOME\.talos" }
$binDir = Join-Path $installDir "bin"

Write-Host "Uninstalling $Binary..." -ForegroundColor Cyan

# Remove the 'oo' symbolic link (or copy fallback).
$aliasLink = Join-Path $binDir "$Alias.exe"
if (Test-Path $aliasLink) {
  Remove-Item -Path $aliasLink -Force -ErrorAction SilentlyContinue
  Write-Host "Removed '$Alias' link at $aliasLink" -ForegroundColor Cyan
}

# Remove the install directory.
if (Test-Path $installDir) {
  Remove-Item -Recurse -Force $installDir -ErrorAction SilentlyContinue
  Write-Host "Removed $installDir" -ForegroundColor Green
} else {
  Write-Host "$installDir not found; nothing to remove." -ForegroundColor Cyan
}

# Remove the bin directory from the user's PATH.
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not [string]::IsNullOrEmpty($userPath) -and $userPath -like "*$binDir*") {
  $newPath = ($userPath -split ';' | Where-Object { $_ -ne $binDir -and $_ -ne "" }) -join ';'
  [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
  $env:Path = ($env:Path -split ';' | Where-Object { $_ -ne $binDir -and $_ -ne "" }) -join ';'
  Write-Host "Removed $binDir from your PATH." -ForegroundColor Cyan
}

# Remove any legacy 'oo' alias line from the user's PowerShell profile.
$profilePath = $PROFILE.CurrentUserAllHosts
if (Test-Path $profilePath) {
  $lines = Get-Content -Path $profilePath
  $filtered = $lines | Where-Object {
    $_ -notmatch "^\s*Set-Alias\s+-Name\s+$Alias\b" -and $_.Trim() -ne "# talos"
  }
  if ($filtered.Count -ne $lines.Count) {
    Set-Content -Path $profilePath -Value $filtered
    Write-Host "Cleaned talos entries from $profilePath" -ForegroundColor Cyan
  }
}

Write-Host ""
Write-Host "$Binary was uninstalled successfully." -ForegroundColor Green
Write-Host "Restart your terminal to finish cleaning up your environment." -ForegroundColor Cyan
