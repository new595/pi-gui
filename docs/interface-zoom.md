# Interface zoom

Interface zoom scales the app as one surface. It is useful when the default text and controls are too small or too large for the current display.

## Change the zoom

Open **Settings → Appearance** and choose **Interface zoom**. The available levels are **90%, 100%, 110%, 125%, and 150%**. The Appearance section also has **Reset to 100%**. **125%** is a useful starting point on a high-DPI display when the default feels too small.

Keyboard shortcuts work when the integrated terminal does not have focus:

- **Ctrl+-** (macOS: **⌘-**) steps down one level.
- **Ctrl+=** (macOS: **⌘=**) steps up one level.
- **Ctrl+0** (macOS: **⌘0**) resets to 100%.

At either limit, stepping farther keeps the current level. When the integrated terminal has focus, these key presses are left to the shell.

## Saved setting and compatibility

The selected level is saved in `interface-zoom.json` in the app's user data directory, separately from the existing `ui-state.json`. This keeps the zoom preference independent of the older UI-state format and leaves existing UI state available to older builds. If the zoom sidecar is missing or cannot be read as a supported value, the app starts at 100%; when a valid backup is available, it can recover from that backup. The zoom preference is shared by windows that use the same app user data directory.

## Proxy.3 test entry

Launch the installed build from the separate **Pi GUI proxy.3 测试版** shortcut on the Desktop. It runs the ordinary CMD helper at `F:\Apps\pi-gui-proxy\scripts\launch-proxy3-test.cmd`, which starts the proxy.3 executable and sets `PI_APP_USER_DATA_DIR` to `%LOCALAPPDATA%\pi-gui-proxy-build`. Keep the existing proxy.2 shortcut for proxy.2; installing or launching proxy.3 does not activate it as the default build.

## Verification status

For this build, the packaged `main.js`, `preload.js`, renderer `index.html`, and every renderer asset were compared byte-for-byte with the corresponding files in `apps/desktop/out`. The hashes and sizes are recorded in `.artifacts/interface-zoom/package-check.json`.

The core interface-zoom acceptance passed, and native screenshot review confirmed the 125% and 150% layouts. An earlier Ctrl+- discrepancy came from the test CDP/input route and screenshot coordinate measurement; no product CSS change was needed. Packaged-app acceptance passed both the interface-zoom and proxy-status cases (2/2, one worker, no retries); see `.artifacts/interface-zoom/run-packaged/packaged-tests.log`. No real-provider conversation was run for this zoom change.

Quit the current Pi GUI completely before switching between proxy.2 and proxy.3: they share a user-data directory and a single-instance lock. On 2026-09-27 the user reported that proxy.3 trial use had revealed no problems so far; this is user feedback, separate from automated acceptance.
