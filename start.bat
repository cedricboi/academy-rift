@echo off
REM Double-click to launch Academy Rift.
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"
echo Starting Academy Rift...
echo Open http://localhost:3100 in up to 4 browser tabs / devices to play.
node server.js
pause
