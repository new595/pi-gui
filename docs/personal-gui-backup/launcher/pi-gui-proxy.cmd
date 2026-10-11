@echo off
setlocal
set "PI_APP_USER_DATA_DIR=%LOCALAPPDATA%\pi-gui-proxy-v1"
start "" /D "%~dp0versions\1.0.1-proxy.4" "%~dp0versions\1.0.1-proxy.4\pi-gui.exe"
endlocal
