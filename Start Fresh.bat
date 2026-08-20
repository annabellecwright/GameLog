@echo off
rem
rem Double-click this to empty the example collection out of a fresh copy, so the
rem shelf is blank and ready for yours. It clears the games, hardware, lists,
rem log, profile and title, and leaves everything else alone.
rem
rem It is safe: it shows you exactly what it will erase and then asks you to type
rem a word to confirm, so a stray double-click cannot wipe anything. You normally
rem do this once, right after setting up your copy.
rem
rem (Windows only. On a Mac use "Start Fresh.command".)

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   GameLog needs Node.js, and it is not installed yet.
  echo   Install it once from  https://nodejs.org  ^(choose the LTS version^).
  echo.
  pause
  exit /b 1
)

node scripts\start-fresh.mjs

echo.
pause
