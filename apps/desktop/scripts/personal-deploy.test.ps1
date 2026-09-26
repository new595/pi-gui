$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$deploy = Join-Path $PSScriptRoot 'personal-deploy.ps1'
$fixture = Join-Path $PSScriptRoot 'fixtures/personal-build-valid'
$testArtifacts = Join-Path ([System.IO.Path]::GetTempPath()) ('pi-gui-deploy-test-' + [guid]::NewGuid().ToString('N'))
$root = Join-Path $testArtifacts 'deployment root'

function Invoke-ExpectedFailure([string[]]$Arguments, [string]$Description) {
  & powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File $deploy @Arguments
  if ($LASTEXITCODE -eq 0) { throw "Expected failure: $Description" }
  Write-Host "ok - $Description"
}

function New-LaunchProbe([string]$ExePath) {
  $code = @'
using System;
using System.IO;
public static class PersonalBuildLaunchProbe {
  public static int Main() {
    File.WriteAllText(Environment.GetEnvironmentVariable("PI_TEST_ENV_OUTPUT"),
      Environment.GetEnvironmentVariable("PI_APP_USER_DATA_DIR") ?? "<missing>");
    return 0;
  }
}
'@
  Add-Type -TypeDefinition $code -OutputAssembly $ExePath -OutputType ConsoleApplication
}

function New-SyntheticBundle([string]$Id, [string]$Path, [switch]$BadHash) {
  Copy-Item -LiteralPath $fixture -Destination $Path -Recurse
  $manifestPath = Join-Path $Path 'manifest.json'
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  $manifest.id = $Id
  if ($BadHash) { $manifest.bundleHash = ('0' * 64) }
  [System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
}

try {
  $firstBundle = Join-Path $testArtifacts 'bundle-first'
  New-Item -ItemType Directory -Path $root -Force | Out-Null
  New-SyntheticBundle '9.9.9-proxy.9' $firstBundle
  $common = @('-Root', $root)
  & powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File $deploy -Mode Install -Id '9.9.9-proxy.9' -BundlePath $firstBundle @common
  if ($LASTEXITCODE -ne 0) { throw 'First synthetic install failed' }
  Write-Host 'ok - valid synthetic bundle installs without activation'

  Invoke-ExpectedFailure (@('-Mode', 'Install', '-Id', '9.9.9-proxy.9', '-BundlePath', $firstBundle) + $common) 'existing version is never overwritten'
  Invoke-ExpectedFailure (@('-Mode', 'Activate', '-Id', '..\outside') + $common) 'path traversal build id is rejected'
  Invoke-ExpectedFailure (@('-Mode', 'Activate', '-Id', '9.9.8-proxy.8') + $common) 'unknown version is not activated'
  Invoke-ExpectedFailure (@('-Mode', 'Install', '-Id', '9.9.12-proxy.12', '-BundlePath', $root) + $common) 'bundle source overlapping install root is rejected'

  $secondBundle = Join-Path $testArtifacts 'bundle-second'
  New-SyntheticBundle '9.9.10-proxy.10' $secondBundle
  & powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File $deploy -Mode Install -Id '9.9.10-proxy.10' -BundlePath $secondBundle @common
  if ($LASTEXITCODE -ne 0) { throw 'Second synthetic install failed' }
  & powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File $deploy -Mode Activate -Id '9.9.9-proxy.9' @common
  if ($LASTEXITCODE -ne 0) { throw 'First activation failed' }
  & powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File $deploy -Mode Activate -Id '9.9.10-proxy.10' @common
  if ($LASTEXITCODE -ne 0) { throw 'Second activation failed' }
  & powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File $deploy -Mode Rollback @common
  if ($LASTEXITCODE -ne 0) { throw 'Rollback failed' }
  $statePath = Join-Path $root 'state.json'
  $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
  if ($state.current -cne '9.9.9-proxy.9') { throw "Unexpected active version after rollback: $($state.current)" }
  Write-Host 'ok - rollback selects the previously active build'

  Set-Content -LiteralPath (Join-Path $root 'versions/9.9.10-proxy.10/resources/app.asar') -Value 'corrupted fixture'
  Invoke-ExpectedFailure (@('-Mode', 'Rollback') + $common) 'corrupt rollback target is rejected'
  $afterFailure = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
  if ($afterFailure.current -cne '9.9.9-proxy.9') { throw 'Failed rollback changed the active pointer' }
  Write-Host 'ok - failed rollback leaves the active version unchanged'

  $badBundle = Join-Path $testArtifacts 'bundle-bad-hash'
  New-SyntheticBundle '9.9.11-proxy.11' $badBundle -BadHash
  Invoke-ExpectedFailure (@('-Mode', 'Install', '-Id', '9.9.11-proxy.11', '-BundlePath', $badBundle) + $common) 'bundle hash mismatch prevents installation'
  if (Test-Path -LiteralPath (Join-Path $root 'versions/9.9.11-proxy.11')) { throw 'Failed install left an installed version' }
  $afterInstallFailure = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
  if ($afterInstallFailure.current -cne '9.9.9-proxy.9') { throw 'Failed install changed the active pointer' }
  Write-Host 'ok - failed install leaves no version and cannot change activation'

  # Exercise direct Launch scope and a real generated CMD entry point from a
  # root containing spaces and CMD metacharacters.
  $launchBundle = Join-Path $testArtifacts 'bundle-launch'
  New-SyntheticBundle '9.9.12-proxy.12' $launchBundle
  New-LaunchProbe (Join-Path $launchBundle 'pi-gui.exe')
  & powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File $deploy -Mode Install -Id '9.9.12-proxy.12' -BundlePath $launchBundle @common
  if ($LASTEXITCODE -ne 0) { throw 'Launch probe install failed' }
  & powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File $deploy -Mode Activate -Id '9.9.12-proxy.12' @common
  if ($LASTEXITCODE -ne 0) { throw 'Launch probe activation failed' }

  $outputPath = Join-Path $root 'direct-launch-env.txt'
  $env:PI_TEST_ENV_OUTPUT = $outputPath
  $env:PI_APP_USER_DATA_DIR = 'sentinel-restore-check'
  try {
    & $deploy -Mode Launch -Root $root
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    while (-not (Test-Path -LiteralPath $outputPath) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 100 }
    if ((Get-Content -LiteralPath $outputPath -Raw) -ne (Join-Path $env:LOCALAPPDATA 'pi-gui-proxy-build')) { throw 'Direct launch child inherited the wrong app data path' }
    if ($env:PI_APP_USER_DATA_DIR -cne 'sentinel-restore-check') { throw 'Direct launch did not restore the caller environment' }
  } finally {
    Remove-Item Env:PI_TEST_ENV_OUTPUT -ErrorAction SilentlyContinue
    Remove-Item Env:PI_APP_USER_DATA_DIR -ErrorAction SilentlyContinue
  }
  Write-Host 'ok - direct launch scopes user data to child and restores the caller environment'

  $cmdRoot = Join-Path $testArtifacts 'launcher root & spaces'
  $cmdBundle = Join-Path $testArtifacts 'bundle-cmd'
  New-SyntheticBundle '9.9.13-proxy.13' $cmdBundle
  New-LaunchProbe (Join-Path $cmdBundle 'pi-gui.exe')
  & powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File $deploy -Mode Install -Id '9.9.13-proxy.13' -BundlePath $cmdBundle -Root $cmdRoot
  if ($LASTEXITCODE -ne 0) { throw 'CMD probe install failed' }
  & powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File $deploy -Mode Activate -Id '9.9.13-proxy.13' -Root $cmdRoot
  if ($LASTEXITCODE -ne 0) { throw 'CMD probe activation failed' }
  & $deploy -Mode Bootstrap -Root $cmdRoot
  $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $cmdRoot 'Start pi-gui proxy.lnk'))
  if ($shortcut.Arguments -notmatch '-ExecutionPolicy RemoteSigned') { throw 'Start shortcut must use per-process RemoteSigned' }
  if ($shortcut.Arguments -notmatch [regex]::Escape('"' + $cmdRoot + '"')) { throw 'Start shortcut did not quote the fixed root argument' }
  $cmdOutput = Join-Path $root 'cmd-launch-env.txt'
  $env:PI_TEST_ENV_OUTPUT = $cmdOutput
  $cmdLine = '/d /c ""{0}"' -f (Join-Path $cmdRoot 'pi-gui-proxy.cmd')
  $cmdProcess = Start-Process -FilePath $env:ComSpec -ArgumentList $cmdLine -WindowStyle Hidden -PassThru -Wait
  if ($cmdProcess.ExitCode -ne 0) { throw "CMD launcher exited with $($cmdProcess.ExitCode)" }
  if (-not (Test-Path -LiteralPath $cmdOutput)) { throw 'Generated CMD launcher did not start its selected build' }
  if ((Get-Content -LiteralPath $cmdOutput -Raw) -ne (Join-Path $env:LOCALAPPDATA 'pi-gui-proxy-build')) { throw 'CMD launcher child inherited the wrong app data path' }
  Remove-Item Env:PI_TEST_ENV_OUTPUT -ErrorAction SilentlyContinue
  Write-Host 'ok - generated CMD launcher safely forwards a root with spaces and ampersand'
}
finally {
  Write-Host "Synthetic deployment artifacts retained for diagnosis: $testArtifacts"
}
