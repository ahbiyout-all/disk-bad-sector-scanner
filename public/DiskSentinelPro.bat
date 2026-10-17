@echo off
REM ===================================================================
REM DiskSentinel Pro - Windows Native Desktop Launcher
REM Launches DiskSentinel Pro in clean Application Frame mode or default browser
REM ===================================================================

set "APP_HTML=%~dp0index.html"
set "NORM_HTML=%APP_HTML:\=/%"

rem Try launching Microsoft Edge in dedicated App Mode
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" goto LAUNCH_EDGE_X86
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" goto LAUNCH_EDGE
if exist "%LocalAppData%\Microsoft\Edge\Application\msedge.exe" goto LAUNCH_EDGE_LOCAL

rem Fallback: Launch directly in system default browser
start "" "%APP_HTML%"
exit /b 0

:LAUNCH_EDGE_X86
start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="file:///%NORM_HTML%"
exit /b 0

:LAUNCH_EDGE
start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app="file:///%NORM_HTML%"
exit /b 0

:LAUNCH_EDGE_LOCAL
start "" "%LocalAppData%\Microsoft\Edge\Application\msedge.exe" --app="file:///%NORM_HTML%"
exit /b 0
