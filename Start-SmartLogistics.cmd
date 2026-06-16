@echo off
cd /d "%~dp0"
echo SmartLogistics will run at:
echo   Web app:    http://localhost:3000/web
echo   Mobile app: http://localhost:3000/mobile
echo.
echo Keep this window open while using the system.
echo If port 3000 is already in use, close the old server window first.
echo.
"C:\Users\UsEr\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.js
pause
