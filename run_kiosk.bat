@echo off
title ChemistTasker Kiosk Terminal

:: Check if Django Backend is listening on port 8000
netstat -ano | findstr ":8000 " | findstr "LISTENING" >nul
if errorlevel 1 (
    echo Starting ChemistTasker Backend on port 8000...
    start /min "ChemistTasker Backend" cmd /c "cd /d c:\ChemistTasker_Ezy\chemisttasker-ezy\backend && ..\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000"
    timeout /t 3 /nobreak >nul
)

:: Check if Frontend Gateway is listening on port 3000
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul
if errorlevel 1 (
    echo Starting ChemistTasker Web Platform on port 3000...
    start /min "ChemistTasker Frontend" cmd /c "cd /d c:\ChemistTasker_Ezy\chemisttasker-ezy\frontend_web && npm.cmd run dev"
    timeout /t 4 /nobreak >nul
)

:: Launch Kiosk in Dedicated App Window (Chromium App Mode)
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://localhost:3000/kiosk
) else if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:3000/kiosk
) else (
    start http://localhost:3000/kiosk
)
