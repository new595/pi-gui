# Windows personal builds

Personal Windows builds live in `F:\Apps\pi-gui-proxy\versions\<id>`. Each installed id is an immutable directory containing the unpacked Electron application and a `manifest.json`. The stable launcher is `F:\Apps\pi-gui-proxy\pi-gui-proxy.cmd`; its selected version is recorded in `state.json` as `current` and `previous`.

The `Start pi-gui proxy.lnk` shortcut launches a hidden PowerShell helper; the selected Pi GUI remains a normal visible application. `pi-gui-proxy.cmd` is available as a backup entry point. Both read and validate the selected manifest and SHA256 of `resources/app.asar` each time they start. Selection changes affect the next full launch. The deploy tool never terminates a running process and never migrates or removes app data. Personal build identity is the package version plus build label, for example `0.1.0-beta.40-proxy.2`.

## First setup

Run the following from a PowerShell prompt in the repository. The bootstrap refuses to overwrite an existing launcher or deployment script.

```powershell
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File .\apps\desktop\scripts\personal-deploy.ps1 -Mode Bootstrap
# On an empty stable directory, install this build before activating it.
$deploy = 'F:\Apps\pi-gui-proxy\scripts\personal-deploy.ps1'
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File $deploy -Mode Install -Id 0.1.0-beta.40-proxy.1 -BundlePath F:\path\to\proxy.1\win-unpacked
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File $deploy -Mode Activate -Id 0.1.0-beta.40-proxy.1
```

Bootstrap installs the shortcut, fixed command launcher, and a copy of the deployment script under the stable directory. `-ExecutionPolicy RemoteSigned` applies only to that PowerShell process; it does not alter machine or user policy. On the current personal install, `proxy.1` is already installed; the activation command above is a maintenance example. For a new install, use the actual unpacked build path and matching id.

## Install and switch builds

Build the unpacked Windows app with the selected personal label and create a `manifest.json` beside `pi-gui.exe`. The manifest's `id` must match `<package-version>-<build-label>`, and `bundleHash` must be the lowercase SHA256 of `resources/app.asar`. Then install and select it:

```powershell
$deploy = 'F:\Apps\pi-gui-proxy\scripts\personal-deploy.ps1'
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File $deploy -Mode Install -Id 0.1.0-beta.40-proxy.2 -BundlePath F:\path\to\win-unpacked
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File $deploy -Mode List
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File $deploy -Mode Activate -Id 0.1.0-beta.40-proxy.2
```

`Install` refuses an existing id and does not activate it. `Activate` accepts only a complete version directory with a matching manifest and app archive hash. The state file is replaced atomically, so an interrupted or invalid switch leaves the prior selection intact.

Rollback to the previously selected installed version:

```powershell
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File $deploy -Mode Rollback
```

The rollback command above selects the previous build; to switch to a specific installed version, run `powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File $deploy -Mode Activate -Id 0.1.0-beta.40-proxy.1`. Close the app normally and use `Start pi-gui proxy.lnk` for the next full start. Switching never force-closes an open app. The launcher scopes `PI_APP_USER_DATA_DIR` to `%LOCALAPPDATA%\pi-gui-proxy-build` for the GUI child process, then restores its own environment. The app continues to use the existing Pi configuration and authentication in the user's normal profile; the personal deploy tool does not read credentials or modify those settings.

## Synthetic verification

Run `powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File apps\desktop\scripts\personal-deploy.test.ps1` to exercise synthetic installs, overwrite and invalid-id rejection, source-path overlap protection, activation, rollback, corrupt target rejection, hash failure, child-only user-data scoping, and the generated CMD launcher with a root containing spaces and `&`. The test retains its temporary deployment artifacts for diagnosis and never accesses user credentials.
