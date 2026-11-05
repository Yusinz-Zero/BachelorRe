@echo off
rem ============================================================
rem  Bachelor:Re — PC unset: restore hgdownloadsdk.dll from the .bak
rem  backup and remove ak_exe_filepath.txt (mirrors upstream
rem  unset_pc.cmd, runs on the C component's .venv — no pipx).
rem ============================================================
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [err] Node.js not found — install it first (https://nodejs.org)
  pause
  exit /b 1
)
echo == Bachelor:Re — PC unset (restore original DLL) ==
node cli.js pc unset
echo.
pause
