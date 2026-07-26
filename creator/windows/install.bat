@echo off
setlocal EnableExtensions EnableDelayedExpansion
title BrickVerse Creator Installer

set "APP_NAME=BrickVerse Creator"
set "PUBLISHER=Meta Games LLC"
set "INSTALL_DIR=%ProgramFiles%\BrickVerse Creator"
set "SOURCE_DIR=%~dp0"
set "EXE_NAME=windows.exe"

if not exist "%SOURCE_DIR%%EXE_NAME%" (
    echo.
    echo ERROR: %EXE_NAME% was not found beside this installer.
    echo Place installer.bat inside the BrickVerse Creator Windows export folder.
    echo.
    pause
    exit /b 1
)

fltmc >nul 2>&1
if errorlevel 1 (
    echo Requesting administrator permission...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
      "Start-Process -FilePath '%~f0' -WorkingDirectory '%~dp0' -Verb RunAs"
    exit /b
)

echo.
echo Installing %APP_NAME%...
echo Destination: "%INSTALL_DIR%"
echo.

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

robocopy "%SOURCE_DIR%" "%INSTALL_DIR%" /E /R:2 /W:1 /XD ".git" /XF "installer.bat" "install.sh" "install.command" "README.txt" >nul
set "ROBOCOPY_CODE=%ERRORLEVEL%"

if %ROBOCOPY_CODE% GEQ 8 (
    echo.
    echo ERROR: Failed to copy BrickVerse Creator files.
    echo Robocopy exit code: %ROBOCOPY_CODE%
    pause
    exit /b %ROBOCOPY_CODE%
)

echo Creating shortcuts...

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$shell=New-Object -ComObject WScript.Shell;" ^
  "$desktop=[Environment]::GetFolderPath('CommonDesktopDirectory');" ^
  "$shortcut=$shell.CreateShortcut((Join-Path $desktop 'BrickVerse Creator.lnk'));" ^
  "$shortcut.TargetPath='%INSTALL_DIR%\%EXE_NAME%';" ^
  "$shortcut.WorkingDirectory='%INSTALL_DIR%';" ^
  "$shortcut.IconLocation='%INSTALL_DIR%\%EXE_NAME%,0';" ^
  "$shortcut.Description='Create and edit BrickVerse worlds';" ^
  "$shortcut.Save();" ^
  "$startMenu=Join-Path ([Environment]::GetFolderPath('CommonPrograms')) 'BrickVerse';" ^
  "New-Item -ItemType Directory -Force -Path $startMenu | Out-Null;" ^
  "$menuShortcut=$shell.CreateShortcut((Join-Path $startMenu 'BrickVerse Creator.lnk'));" ^
  "$menuShortcut.TargetPath='%INSTALL_DIR%\%EXE_NAME%';" ^
  "$menuShortcut.WorkingDirectory='%INSTALL_DIR%';" ^
  "$menuShortcut.IconLocation='%INSTALL_DIR%\%EXE_NAME%,0';" ^
  "$menuShortcut.Description='Create and edit BrickVerse worlds';" ^
  "$menuShortcut.Save();"

if errorlevel 1 (
    echo WARNING: Files were installed, but one or more shortcuts could not be created.
)

echo.
echo %APP_NAME% was installed successfully.
echo.

choice /C YN /N /M "Launch BrickVerse Creator now? [Y/N]: "
if errorlevel 2 exit /b 0

start "" "%INSTALL_DIR%\%EXE_NAME%"
exit /b 0
