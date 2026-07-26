@echo off
setlocal EnableDelayedExpansion

:: ==========================================
:: BrickVerse Installer
:: ==========================================

title BrickVerse Installer

:: Require Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo Requesting Administrator permissions...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit
)

set INSTALL_DIR=%ProgramFiles%\BrickVerse

echo.
echo Installing BrickVerse...
echo.

if not exist "%INSTALL_DIR%" (
    mkdir "%INSTALL_DIR%"
)

echo Copying files...

robocopy "%~dp0" "%INSTALL_DIR%" /E /NFL /NDL /NJH /NJS /NP >nul

echo Creating shortcuts...

powershell -NoProfile ^
"$s=(New-Object -COM WScript.Shell);" ^
"$d=$s.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\BrickVerse.lnk');" ^
"$d.TargetPath='%INSTALL_DIR%\windows.exe';" ^
"$d.WorkingDirectory='%INSTALL_DIR%';" ^
"$d.IconLocation='%INSTALL_DIR%\windows.exe';" ^
"$d.Save();"

powershell -NoProfile ^
"$s=(New-Object -COM WScript.Shell);" ^
"$m=[Environment]::GetFolderPath('Programs');" ^
"$d=$s.CreateShortcut($m+'\BrickVerse.lnk');" ^
"$d.TargetPath='%INSTALL_DIR%\windows.exe';" ^
"$d.WorkingDirectory='%INSTALL_DIR%';" ^
"$d.IconLocation='%INSTALL_DIR%\windows.exe';" ^
"$d.Save();"

echo.
echo Installation Complete.
echo.

choice /M "Launch BrickVerse now"

if %errorlevel%==1 (
    start "" "%INSTALL_DIR%\windows.exe"
)

exit