@echo off
rem
rem Double-click this to edit your GameLog.
rem
rem It starts the manager (a small editor that runs on your own machine) in its
rem own window and opens it in your browser. Keep the "GameLog Manager" window
rem open while you edit, and close it when you are done.
rem
rem (Windows only. On a Mac use "Open GameLog Manager.command".)

rem Work from this file's own folder.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   GameLog needs Node.js, and it is not installed yet.
  echo.
  echo   Install it once from  https://nodejs.org  ^(choose the LTS version^),
  echo   then double-click this file again.
  echo.
  pause
  exit /b 1
)

set PORT=4321
set URL=http://localhost:%PORT%/manage.html

rem Start the manager in its own window. Keep that window open while editing;
rem closing it stops the manager.
start "GameLog Manager" cmd /k node scripts\manage.mjs %PORT%

rem Give it a moment to start, then open the browser, then this window closes.
timeout /t 2 /nobreak >nul
start "" %URL%
exit /b 0
