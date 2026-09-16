@echo off
setlocal
title ChemistTasker Offline Kiosk

set "KIOSK_ROOT=%~dp0"
set "KIOSK_EXE=%KIOSK_ROOT%frontend_web\src-tauri\target\release\chemisttasker-kiosk.exe"

if exist "%KIOSK_EXE%" (
    start "ChemistTasker Kiosk" "%KIOSK_EXE%"
    exit /b 0
)

where cargo.exe >nul 2>nul
if errorlevel 1 goto :missing_build

if not exist "%KIOSK_ROOT%frontend_web\node_modules\.bin\tauri.cmd" goto :missing_build

cd /d "%KIOSK_ROOT%frontend_web"
call npm.cmd run kiosk:dev
exit /b %errorlevel%

:missing_build
echo ChemistTasker Offline Kiosk has not been built on this computer.
echo Install the Rust toolchain and frontend dependencies, then run:
echo   cd /d "%KIOSK_ROOT%frontend_web"
echo   npm.cmd install
echo   npm.cmd run kiosk:build
pause
exit /b 1
