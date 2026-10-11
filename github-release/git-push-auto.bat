@echo off
REM ===================================================================
REM DiskSentinel Pro - GitHub Essential Files Sync & Push Script
REM Operating System: Windows (CRLF)
REM Language: English
REM Author: AhBiYout (CISNet)
REM Repository: https://github.com/AhBiYout-all/disk-bad-sector-scanner
REM ===================================================================

echo ===================================================================
echo   DiskSentinel Pro - Essential GitHub Push Automation
echo ===================================================================

echo [STEP 1] Detecting current version...
FOR /F "tokens=*" %%i IN ('node -p "require('./package.json').version"') DO SET APP_VERSION=%%i

if "%APP_VERSION%"=="" (
    echo [ERROR] Failed to read version from package.json!
    pause
    exit /b 1
)
echo -^> Current Version: v%APP_VERSION%

echo.
echo [STEP 2] Running TypeScript typecheck and syntax verification...
call npm run lint
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Type check failed! Fix compilation errors before uploading to GitHub.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [STEP 3] Generating dedicated GitHub Essential bundle in .github-release/ ...
call node scripts/bundle-essential-release.mjs
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to bundle essential files!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [STEP 4] Current Git Status:
git status

echo.
echo ===================================================================
echo Notice: Only essential source and build files will be committed.
echo Build caches, node_modules, and binary dists are strictly ignored.
echo ===================================================================
set /p CONFIRM="Do you want to stage essential files and push to GitHub? (Y/N): "
if /i "%CONFIRM%" NEQ "Y" (
    echo -^> Aborted by user.
    pause
    exit /b 0
)

echo.
echo [STEP 5] Staging only essential core project files...
git add package.json tsconfig.json vite.config.ts index.html metadata.json .env.example .gitignore setup.iss build.bat git-push-auto.bat
git add src/ public/ docs/ .github/ scripts/
git status

echo.
echo [STEP 6] Creating release commit...
set COMMIT_MSG=Release v%APP_VERSION% - Essential Build Package for Production
set /p USER_MSG="Enter commit message (or press ENTER to use default): "
if not "%USER_MSG%"=="" set COMMIT_MSG=%USER_MSG%

git commit -m "%COMMIT_MSG%"

echo.
echo [STEP 7] Pushing to remote repository (main)...
git push origin main

echo.
echo [STEP 8] Tagging release v%APP_VERSION%...
git tag -a v%APP_VERSION% -m "Release v%APP_VERSION% - Essential Build"
git push origin v%APP_VERSION%

echo.
echo ===================================================================
echo   ESSENTIAL FILES SYNCHRONIZED SUCCESSFULLY TO GITHUB
echo ===================================================================
echo Official Repository: https://github.com/AhBiYout-all/disk-bad-sector-scanner
echo Dedicated Staging:   .github-release/
pause
