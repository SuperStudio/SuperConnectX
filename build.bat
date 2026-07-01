@echo off
setlocal
cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
    echo [INFO] Requesting administrator privileges...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c cd /d ""%~dp0"" && ""%~f0""' -Verb RunAs"
    exit /b
)

call npm run build:win
set "BUILD_EXIT=%ERRORLEVEL%"
if not "%BUILD_EXIT%"=="0" (
    echo [ERROR] Local build failed with exit code %BUILD_EXIT%.
    pause
    exit /b %BUILD_EXIT%
)
pause
