@echo off
title ChemistTasker Kiosk Terminal

:: Check if Django Backend is listening on port 8000
netstat -ano | findstr ":8000 " | findstr "LISTENING" >nul
if errorlevel 1 (
    echo Starting ChemistTasker Backend on port 8000...
    start /min "ChemistTasker Backend" cmd /c "cd /d c:\ChemistTasker_Ezy\chemisttasker-ezy\backend && ..\.venv\Scripts\python.exe manage.py runserver 8000"
    timeout /t 3 /nobreak >nul
)

:: Check if Frontend Web is listening on port 5173
netstat -ano | findstr ":5173 " | findstr "LISTENING" >nul
if errorlevel 1 (
    echo Starting ChemistTasker Frontend on port 5173...
    start /min "ChemistTasker Frontend" cmd /c "cd /d c:\ChemistTasker_Ezy\chemisttasker-ezy\frontend_web && npm run dev:5173"
    timeout /t 3 /nobreak >nul
)

:: Launch Kiosk in Dedicated App Window (Chromium App Mode)
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:5173/kiosk
) else if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://localhost:5173/kiosk
) else (
    start http://localhost:5173/kiosk
)
