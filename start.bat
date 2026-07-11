@echo off
TITLE Skill Manager - Launcher
echo ==========================================
echo       Skill Manager is Starting...
echo ==========================================
echo.
echo [1/3] Cleaning up ports...
powershell -Command "Get-NetTCPConnection -LocalPort 3001, 5173 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"

echo [2/3] Checking dependencies...
if not exist node_modules (
    echo [!] node_modules not found. Installing...
    call pnpm install
)

echo [3/3] Launching Backend and Frontend...
echo.
echo Dashboard will be available at http://localhost:5173
echo.
pnpm dev:all
pause
