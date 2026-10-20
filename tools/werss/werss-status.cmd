@echo off
chcp 65001 >nul
REM Read-only WeRSS health check: credential expiry, last sync per account, latest article date.
REM Exit code: 0 = all fresh; 1 = some account older than 4 days; 2 = cannot read data.

setlocal
echo === WeRSS status (read-only) ===
ssh yihot "cd /opt/werss && sudo -n docker cp werss_status.py yihot-werss-werss-1:/tmp/werss_status.py && sudo -n docker compose -f compose.yml -f compose.weread.yml exec -T werss python3 /tmp/werss_status.py /app/data"
set RC=%ERRORLEVEL%
echo.
if "%RC%"=="0" (
  echo [OK] All accounts synced within 4 days.
) else if "%RC%"=="1" (
  echo [WARN] Some account is older than 4 days. Run werss-scan.cmd to re-authorize.
) else (
  echo [ERROR] Cannot read status. Check SSH, container, or /opt/werss/werss_status.py.
)
pause
