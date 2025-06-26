Write-Host "Switching to PRODUCTION mode..." -ForegroundColor Red

# Update server CORS
$serverFile = "apps/server/index.js"
(Get-Content $serverFile) -replace 'http://localhost:3000', 'https://werewolf-mafia-host.onrender.com' -replace 'http://localhost:3001', 'https://werewolf-mafia-player.onrender.com' | Set-Content $serverFile

# Update player app
$playerFile = "apps/player/src/App.jsx"
(Get-Content $playerFile) -replace 'http://localhost:3002', 'https://werewolf-mafia-server.onrender.com' | Set-Content $playerFile

# Update host app  
$hostFile = "apps/host/src/App.jsx"
(Get-Content $hostFile) -replace 'http://localhost:3002', 'https://werewolf-mafia-server.onrender.com' -replace 'http://localhost:3001', 'https://werewolf-mafia-player.onrender.com' | Set-Content $hostFile

Write-Host "✅ URLs switched to production" -ForegroundColor Green
Write-Host "Server: https://werewolf-mafia-server.onrender.com" -ForegroundColor Yellow
Write-Host "Host:   https://werewolf-mafia-host.onrender.com" -ForegroundColor Yellow  
Write-Host "Player: https://werewolf-mafia-player.onrender.com" -ForegroundColor Yellow
Write-Host ""
Write-Host "Ready for deployment:" -ForegroundColor Cyan
Write-Host "git add . && git commit -m 'Update' && git push origin main" -ForegroundColor Gray 