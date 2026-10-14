@echo off
cd /d "%~dp0"
call npm ci
if errorlevel 1 exit /b 1
call npm run android:apk
if errorlevel 1 exit /b 1
pause
