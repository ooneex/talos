#!/usr/bin/env pwsh
# talos installer for Windows.
#
# Usage:
#   powershell -c "irm https://raw.githubusercontent.com/ooneex/talos/main/packages/cli/scripts/install.ps1 | iex"
#
# Environment variables:
#   $env:TALOS_INSTALL   Install directory (default: $HOME\.talos)
#   $env:TALOS_VERSION   Version tag to install (default: latest)

$ErrorActionPreference = "Stop"

$GithubRepo = "ooneex/talos"
$Binary = "talos"

# Detect architecture.
$arch = switch ($env:PROCESSOR_ARCHITECTURE) {
  "AMD64" { "x64" }
  "ARM64" { "arm64" }
  default { throw "Unsupported architecture: $($env:PROCESSOR_ARCHITECTURE)" }
}

$target = "$Binary-windows-$arch"
$asset = "$target.zip"

$version = if ($env:TALOS_VERSION) { $env:TALOS_VERSION } else { "latest" }
$downloadUrl = if ($version -eq "latest") {
  "https://github.com/$GithubRepo/releases/latest/download/$asset"
} else {
  "https://github.com/$GithubRepo/releases/download/$version/$asset"
}

$installDir = if ($env:TALOS_INSTALL) { $env:TALOS_INSTALL } else { "$HOME\.talos" }
$binDir = Join-Path $installDir "bin"
$exe = Join-Path $binDir "$Binary.exe"

Write-Host "Installing $Binary (windows-$arch)..." -ForegroundColor Cyan

$tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

try {
  $zipPath = Join-Path $tmpDir $asset
  Write-Host "Downloading $downloadUrl"
  try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing
  } catch {
    throw "Failed to download $asset. Check that a release exists for '$version'."
  }

  Write-Host "Extracting archive..."
  Expand-Archive -Path $zipPath -DestinationPath $tmpDir -Force

  New-Item -ItemType Directory -Path $binDir -Force | Out-Null
  Move-Item -Path (Join-Path $tmpDir "$Binary.exe") -Destination $exe -Force
} finally {
  Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
}

Write-Host "$Binary was installed successfully to $exe" -ForegroundColor Green

# Add to the user's PATH.
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$binDir*") {
  $newPath = if ([string]::IsNullOrEmpty($userPath)) { $binDir } else { "$binDir;$userPath" }
  [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
  $env:Path = "$binDir;$env:Path"
  Write-Host "Added $binDir to your PATH." -ForegroundColor Cyan
}

Write-Host ""

# Add an 'oo' alias for the talos binary to the user's PowerShell profile.
$Alias = "oo"
$aliasLine = "Set-Alias -Name $Alias -Value `"$exe`""
$profilePath = $PROFILE.CurrentUserAllHosts
$profileDir = Split-Path -Parent $profilePath
if (-not (Test-Path $profileDir)) {
  New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
}
$aliasPattern = "Set-Alias -Name $Alias "
if (-not (Test-Path $profilePath) -or -not (Select-String -Path $profilePath -SimpleMatch $aliasPattern -Quiet)) {
  Add-Content -Path $profilePath -Value "`n# talos`n$aliasLine"
  Set-Alias -Name $Alias -Value $exe
  Write-Host "Added '$Alias' alias for $Binary in $profilePath" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Run '$Binary --version' to get started (restart your terminal first)." -ForegroundColor Green
