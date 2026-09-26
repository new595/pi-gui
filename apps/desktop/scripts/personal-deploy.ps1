[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Bootstrap', 'List', 'Install', 'Activate', 'Rollback', 'Launch')]
  [string]$Mode,
  [string]$Id,
  [string]$BundlePath,
  [string]$Root = 'F:\Apps\pi-gui-proxy'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-Id([string]$Value) {
  if ($Value -cnotmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?-proxy\.\d+$') {
    throw "Invalid personal build id: $Value"
  }
}

function Get-InstallRoot {
  return [System.IO.Path]::GetFullPath($Root).TrimEnd('\')
}

function Get-VersionPath([string]$Value) {
  Assert-Id $Value
  $rootPath = Get-InstallRoot
  $versions = [System.IO.Path]::GetFullPath((Join-Path $rootPath 'versions')).TrimEnd('\')
  $path = [System.IO.Path]::GetFullPath((Join-Path $versions $Value))
  if (-not $path.StartsWith($versions + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Version path escaped versions directory: $Value"
  }
  return $path
}

function Get-ValidatedVersion([string]$Value) {
  $path = Get-VersionPath $Value
  $manifestPath = Join-Path $path 'manifest.json'
  $exe = Join-Path $path 'pi-gui.exe'
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $exe -PathType Leaf)) {
    throw "Incomplete installed personal build: $Value"
  }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if ($manifest.id -cne $Value -or [string]::IsNullOrWhiteSpace([string]$manifest.bundleHash)) {
    throw "Manifest does not validate personal build: $Value"
  }
  $asar = Join-Path $path 'resources/app.asar'
  if (-not (Test-Path -LiteralPath $asar -PathType Leaf)) { throw "Missing packaged app archive: $Value" }
  $actualHash = (Get-FileHash -LiteralPath $asar -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -cne ([string]$manifest.bundleHash).ToLowerInvariant()) { throw "Bundle hash mismatch: $Value" }
  return [pscustomobject]@{ Id = $Value; Path = $path; Manifest = $manifest }
}

function Get-State {
  $statePath = Join-Path (Get-InstallRoot) 'state.json'
  if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) {
    return [pscustomobject]@{ current = $null; previous = $null }
  }
  $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
  foreach ($key in @('current', 'previous')) {
    $value = [string]$state.$key
    if ($value) { Assert-Id $value }
  }
  return $state
}

function Write-State($State) {
  $rootPath = Get-InstallRoot
  New-Item -ItemType Directory -Path $rootPath -Force | Out-Null
  $target = Join-Path $rootPath 'state.json'
  $temporary = Join-Path $rootPath ('.state-' + [guid]::NewGuid().ToString('N') + '.tmp')
  $json = $State | ConvertTo-Json -Compress
  [System.IO.File]::WriteAllText($temporary, $json + "`n", [System.Text.UTF8Encoding]::new($false))
  if (-not ('PiGuiPersonalDeploy.NativeMove' -as [type])) {
      Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
namespace PiGuiPersonalDeploy {
  public static class NativeMove {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool MoveFileEx(string existing, string replacement, int flags);
    public static void Replace(string source, string destination) {
      if (!MoveFileEx(source, destination, 0x1 | 0x8)) {
        throw new Win32Exception(Marshal.GetLastWin32Error());
      }
    }
  }
}
'@
  }
  # Keep a failed temporary state file for diagnosis. The current state remains
  # untouched unless this same-volume atomic replace succeeds.
  [PiGuiPersonalDeploy.NativeMove]::Replace($temporary, $target)
}

function Assert-BundleDirectory([string]$Path, [string]$ExpectedId) {
  $manifestPath = Join-Path $Path 'manifest.json'
  $exe = Join-Path $Path 'pi-gui.exe'
  $asar = Join-Path $Path 'resources/app.asar'
  foreach ($required in @($manifestPath, $exe, $asar)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Incomplete bundle: missing $required" }
  }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if ($manifest.id -cne $ExpectedId -or [string]::IsNullOrWhiteSpace([string]$manifest.bundleHash)) {
    throw "Bundle manifest does not validate personal build: $ExpectedId"
  }
  $actualHash = (Get-FileHash -LiteralPath $asar -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -cne ([string]$manifest.bundleHash).ToLowerInvariant()) { throw "Bundle hash mismatch: $ExpectedId" }
  return $manifest
}

function Set-Active([string]$Value) {
  $null = Get-ValidatedVersion $Value
  $state = Get-State
  if ($state.current -ceq $Value) {
    Write-Host "Already active for next launch: $Value"
    return
  }
  $next = [pscustomobject]@{ current = $Value; previous = [string]$state.current }
  Write-State $next
  Write-Host "Selected for next full launch: $Value"
}

switch ($Mode) {
  'Bootstrap' {
    $rootPath = Get-InstallRoot
    $scriptsPath = Join-Path $rootPath 'scripts'
    $targetScript = Join-Path $scriptsPath 'personal-deploy.ps1'
    $targetLauncher = Join-Path $rootPath 'pi-gui-proxy.cmd'
    $targetShortcut = Join-Path $rootPath 'Start pi-gui proxy.lnk'
    if ((Test-Path -LiteralPath $targetScript) -or (Test-Path -LiteralPath $targetLauncher) -or (Test-Path -LiteralPath $targetShortcut)) {
      throw 'Launcher or deployment script already exists; refusing overwrite'
    }
    New-Item -ItemType Directory -Path $scriptsPath -Force | Out-Null
    Copy-Item -LiteralPath $PSCommandPath -Destination $targetScript
    $launcher = "@echo off`r`nsetlocal`r`npowershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File `"%~dp0scripts\personal-deploy.ps1`" -Mode Launch -Root `"%~dp0.`"`r`n"
    [System.IO.File]::WriteAllText($targetLauncher, $launcher, [System.Text.Encoding]::ASCII)
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($targetShortcut)
    $shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $shortcut.Arguments = "-NoProfile -ExecutionPolicy RemoteSigned -WindowStyle Hidden -File `"$targetScript`" -Mode Launch -Root `"$rootPath`""
    $shortcut.WorkingDirectory = $rootPath
    $shortcut.Description = 'Start pi-gui using the selected personal build'
    $shortcut.Save()
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shortcut)
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell)
    Write-Host "Installed fixed launcher: $targetLauncher"
  }
  'List' {
    $versionsRoot = Join-Path (Get-InstallRoot) 'versions'
    $state = Get-State
    if (Test-Path -LiteralPath $versionsRoot -PathType Container) {
      Get-ChildItem -LiteralPath $versionsRoot -Directory | Sort-Object Name | ForEach-Object {
        try {
          $version = Get-ValidatedVersion $_.Name
          [pscustomobject]@{ Id = $version.Id; Active = ($state.current -ceq $version.Id); Previous = ($state.previous -ceq $version.Id); Label = $version.Manifest.buildLabel }
        } catch {
          [pscustomobject]@{ Id = $_.Name; Active = $false; Previous = $false; Label = 'INVALID' }
        }
      }
    }
  }
  'Install' {
    Assert-Id $Id
    if (-not $BundlePath) { throw '-BundlePath is required for Install' }
    $source = (Resolve-Path -LiteralPath $BundlePath).Path
    if (-not (Test-Path -LiteralPath $source -PathType Container)) { throw 'BundlePath must be an unpacked bundle directory' }
    $source = [System.IO.Path]::GetFullPath($source).TrimEnd('\')
    $final = Get-VersionPath $Id
    $versionsRoot = [System.IO.Path]::GetFullPath((Join-Path (Get-InstallRoot) 'versions')).TrimEnd('\')
    if ($source -ieq (Get-InstallRoot) -or
        $source.StartsWith((Get-InstallRoot) + '\', [System.StringComparison]::OrdinalIgnoreCase) -or
        (Get-InstallRoot).StartsWith($source + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
      throw 'Bundle source and installation root overlap; refusing recursive or self-copy'
    }
    if (-not $final.StartsWith($versionsRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
      throw 'Final version path escaped versions directory'
    }
    if (Test-Path -LiteralPath $final) { throw "Refusing to overwrite existing version: $Id" }
    $parsed = Assert-BundleDirectory $source $Id
    $rootPath = Get-InstallRoot
    New-Item -ItemType Directory -Path $versionsRoot -Force | Out-Null
    $stage = Join-Path $versionsRoot ('.install-' + [guid]::NewGuid().ToString('N'))
    $stage = [System.IO.Path]::GetFullPath($stage)
    if (-not $stage.StartsWith($versionsRoot + '\', [System.StringComparison]::OrdinalIgnoreCase) -or
        -not $final.StartsWith($versionsRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
      throw 'Install stage or final path escaped versions directory'
    }
    if (Test-Path -LiteralPath $stage) { throw "Install staging path already exists: $stage" }
    Copy-Item -LiteralPath $source -Destination $stage -Recurse
    $stagedManifest = Assert-BundleDirectory $stage $Id
    if ($stagedManifest.bundleHash -cne $parsed.bundleHash) { throw 'Staged bundle manifest changed during copy' }
    if (Test-Path -LiteralPath $final) { throw "Refusing to overwrite existing version: $Id" }
    [System.IO.Directory]::Move($stage, $final)
    Write-Host "Installed immutable personal build: $Id (not activated)"
  }
  'Activate' { Set-Active $Id }
  'Rollback' {
    $state = Get-State
    if (-not $state.previous) { throw 'No previous installed build is available for rollback' }
    Set-Active ([string]$state.previous)
  }
  'Launch' {
    $state = Get-State
    if (-not $state.current) { throw 'No active personal build. Run personal-deploy.ps1 -Mode List/Activate first.' }
    $version = Get-ValidatedVersion ([string]$state.current)
    $exe = Join-Path $version.Path 'pi-gui.exe'
    $dataRoot = Join-Path $env:LOCALAPPDATA 'pi-gui-proxy-build'
    $priorExists = Test-Path Env:PI_APP_USER_DATA_DIR
    $priorValue = $env:PI_APP_USER_DATA_DIR
    try {
      $env:PI_APP_USER_DATA_DIR = $dataRoot
      Start-Process -FilePath $exe -WorkingDirectory $version.Path
    } finally {
      if ($priorExists) { $env:PI_APP_USER_DATA_DIR = $priorValue }
      else { Remove-Item Env:PI_APP_USER_DATA_DIR -ErrorAction SilentlyContinue }
    }
  }
}
