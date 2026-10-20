@echo off
chcp 65001 >nul
REM One-click: open WeRSS admin through an SSH tunnel.
REM Prerequisite: ssh yihot works without a password (key installed + ~/.ssh/config).
REM Keep this file ASCII-only: cmd.exe parses batch files in the OEM code page.

setlocal
set TUNNEL_PORT=18001
set SSH_HOST_ALIAS=yihot

where ssh >nul 2>nul
if errorlevel 1 (
  echo [ERROR] ssh.exe not found. Enable OpenSSH Client in Windows optional features.
  pause
  exit /b 1
)

echo [1/3] Starting SSH tunnel on 127.0.0.1:%TUNNEL_PORT% ...
start "WeRSS tunnel - close this window when done" /min ssh -N -o ExitOnForwardFailure=yes -L %TUNNEL_PORT%:127.0.0.1:%TUNNEL_PORT% %SSH_HOST_ALIAS%

echo [2/3] Waiting for the tunnel ...
timeout /t 2 /nobreak >nul

echo [3/3] Opening admin page ...
start "" "http://127.0.0.1:%TUNNEL_PORT%/"

echo.
type "%~dp0scan-instructions.txt"
echo.
timeout /t 8 >nul
