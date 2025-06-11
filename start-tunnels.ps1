# start-tunnels.ps1
Write-Host "Starting SSH tunnels for Werewolf Mafia..." -ForegroundColor Green

# Function to start tunnel in new window
function Start-Tunnel {
    param($Name, $LocalPort, $RemoteSubdomain)
    
    Write-Host "Starting $Name tunnel: $RemoteSubdomain.serveo.net -> localhost:$LocalPort" -ForegroundColor Yellow
    
    $command = "ssh -R ${RemoteSubdomain}:80:localhost:${LocalPort} serveo.net"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$host.ui.RawUI.WindowTitle='$Name Tunnel'; $command"
    
    # Small delay between tunnel starts
    Start-Sleep -Seconds 1
}

# Start all tunnels
Start-Tunnel "Host" 3000 "werewolf-host"
Start-Tunnel "Player" 3001 "werewolf-player"  
Start-Tunnel "Server" 3002 "werewolf-server"

Write-Host ""
Write-Host "All tunnels started in separate windows!" -ForegroundColor Green
Write-Host ""
Write-Host "Your URLs:" -ForegroundColor Cyan
Write-Host "   Host App: https://werewolf-host.serveo.net" -ForegroundColor White
Write-Host "   Player App: https://werewolf-player.serveo.net" -ForegroundColor White
Write-Host "   Server: https://werewolf-server.serveo.net" -ForegroundColor White
Write-Host ""
Write-Host "Now run: pnpm dev:all" -ForegroundColor Magenta 