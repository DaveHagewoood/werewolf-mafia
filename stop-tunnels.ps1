# stop-tunnels.ps1
Write-Host "🛑 Stopping SSH tunnels..." -ForegroundColor Red

# Kill all SSH processes
$sshProcesses = Get-Process | Where-Object {$_.ProcessName -eq "ssh"}

if ($sshProcesses) {
    Write-Host "Found $($sshProcesses.Count) SSH process(es). Stopping..." -ForegroundColor Yellow
    $sshProcesses | Stop-Process -Force
    Write-Host "✅ All SSH tunnels stopped!" -ForegroundColor Green
} else {
    Write-Host "ℹ️ No SSH tunnels were running." -ForegroundColor Gray
}

# Also close any PowerShell windows with tunnel titles (optional cleanup)
$tunnelWindows = Get-Process | Where-Object {$_.MainWindowTitle -like "*Tunnel*"}
if ($tunnelWindows) {
    Write-Host "Closing tunnel windows..." -ForegroundColor Yellow
    $tunnelWindows | Stop-Process -Force
}

Write-Host "🏁 Cleanup complete!" -ForegroundColor Green 