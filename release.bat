@echo off
setlocal
cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
    echo [INFO] Requesting administrator privileges...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c cd /d ""%~dp0"" && ""%~f0""' -Verb RunAs"
    exit /b
)

echo [STEP 1/3] Building local Windows package...
call npm run build:win
set "BUILD_EXIT=%ERRORLEVEL%"
if not "%BUILD_EXIT%"=="0" (
    echo [ERROR] Local build failed with exit code %BUILD_EXIT%.
    pause
    exit /b %BUILD_EXIT%
)

echo [OK] Local package build completed.
echo Output directory: release
echo.

choice /C YN /M "Continue to create and push git release tag"
if errorlevel 2 (
    echo [INFO] Skipped git tag release. Local package is ready in release\.
    pause
    exit /b 0
)

REM Use PowerShell to read version from package.json (handles UTF-8 correctly)
for /f "delims=" %%a in ('powershell -NoProfile -Command "(Get-Content package.json -Encoding UTF8 | ConvertFrom-Json).version"') do set "ver=%%a"

if "%ver%"=="" (
    echo [ERROR] Failed to read version from package.json
    pause
    exit /b 1
)

set "tag=v%ver%"
echo Version: %ver%
echo Tag: %tag%

REM Check if tag already exists
git rev-parse "%tag%" >nul 2>&1
if not errorlevel 1 (
    echo [WARN] Tag %tag% already exists, deleting and recreating...
    git tag -d "%tag%"
)

REM Create tag
git tag "%tag%"
if errorlevel 1 (
    echo [ERROR] Failed to create tag %tag%
    pause
    exit /b 1
)
echo [OK] Tag %tag% created.

REM Push tag
git push origin "%tag%"
if errorlevel 1 (
    echo [ERROR] Failed to push tag %tag%
    pause
    exit /b 1
)

echo [OK] Tag %tag% pushed to origin.
echo Done!
pause
