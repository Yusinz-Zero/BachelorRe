@echo off
rem ============================================================
rem  Bachelor:Re — main --attach_pc in the console (mirrors upstream
rem  main_attach_pc.cmd). Needs pc setup done first (ak_exe_filepath.txt)
rem  and ideally the S server running (node cli.js server start).
rem  Trainer prompt appears here: enable zero_cost / disable all / ...
rem  The launcher path instead is: node cli.js game start
rem ============================================================
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [err] Node.js not found — install it first (https://nodejs.org)
  pause
  exit /b 1
)
echo == Bachelor:Re — main --attach_pc ==
node cli.js pc attach
echo.
pause
