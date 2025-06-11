# stop-tunnels.ps1
Write-Host "STOP: Stopping SSH tunnels..." -ForegroundColor Red

# Kill all SSH processes
$sshProcesses = Get-Process | Where-Object {$_.ProcessName -eq "ssh"}

if ($sshProcesses) {
    Write-Host "Found $($sshProcesses.Count) SSH process(es). Stopping..." -ForegroundColor Yellow
    $sshProcesses | Stop-Process -Force
    Write-Host "SUCCESS: All SSH tunnels stopped!" -ForegroundColor Green
} else {
    Write-Host "INFO: No SSH tunnels were running." -ForegroundColor Gray
}

# More targeted cleanup - only kill PowerShell processes that are specifically tunnel-related
# and NOT running inside IDEs like Cursor, VS Code, etc.
$tunnelPowershells = Get-Process powershell -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowTitle -like "*SSH Tunnel*" -or 
    $_.MainWindowTitle -like "*Port Forward*" -or
    ($_.MainWindowTitle -like "*Tunnel*" -and $_.MainWindowTitle -notlike "*Cursor*" -and $_.MainWindowTitle -notlike "*VS Code*")
}

if ($tunnelPowershells) {
    Write-Host "Found $($tunnelPowershells.Count) tunnel-specific PowerShell window(s). Closing..." -ForegroundColor Yellow
    $tunnelPowershells | Stop-Process -Force
    Write-Host "Closed tunnel-specific PowerShell windows." -ForegroundColor Green
}

Write-Host "DONE: Cleanup complete!" -ForegroundColor Green 