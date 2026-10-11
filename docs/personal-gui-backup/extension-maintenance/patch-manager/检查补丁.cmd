@echo off
chcp 65001 >nul
setlocal
set "NODE_EXE=F:\software\Node.js\node.exe"
if not exist "%NODE_EXE%" (
  echo 找不到 Node.js: %NODE_EXE%
  echo 请在安装 Node.js 后运行 patch-manager.mjs check。
  pause
  exit /b 1
)
"%NODE_EXE%" "%~dp0patch-manager.mjs" check
set "RESULT=%ERRORLEVEL%"
echo.
echo 检查退出码: %RESULT%
pause
exit /b %RESULT%
