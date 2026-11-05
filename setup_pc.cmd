@echo off
rem ============================================================
rem  Bachelor:Re — PC setup: inject frida-gadget into Arknights.exe's
rem  hgdownloadsdk.dll and write ak_exe_filepath.txt (like upstream
rem  setup_pc.cmd, but non-interactive: GamePath comes from launcher
rem  settings, runs on the C component's own .venv python — no pipx).
rem ============================================================
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [err] Node.js not found — install it first (https://nodejs.org)
  pause
  exit /b 1
)
echo == Bachelor:Re — PC setup (inject frida gadget) ==
echo ตรวจว่าได้ตั้ง GamePath (Arknights.exe) ที่ Settings แล้ว
echo กำลัง inject...
node cli.js pc setup
echo.
pause
