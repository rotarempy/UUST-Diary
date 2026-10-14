@echo off
cd /d "%~dp0"
py -3 scripts\update-pages-schedule.py --batch 80
if errorlevel 1 (
  echo.
  echo Schedule update failed. See the error above.
  pause
  exit /b 1
)
echo.
echo Schedule saved into docs\data\schedule
echo Review files and publish with Git.
pause
