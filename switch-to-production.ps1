Write-Host "Switching to PRODUCTION mode..." -ForegroundColor Red

# Update server CORS
$serverFile = "apps/server/index.js"
$content = Get-Content $serverFile
$content = $content -replace 'http://localhost:3000', 'https://werewolf-mafia-host.onrender.com'
$content = $content -replace 'http://localhost:3001', 'https://werewolf-mafia-player.onrender.com'
$content | Set-Content $serverFile

# Update player app
$playerFile = "apps/player/src/App.jsx"
$content = Get-Content $playerFile
$content = $content -replace 'http://localhost:3002', 'https://werewolf-mafia-server.onrender.com'
$content | Set-Content $playerFile

# Update host app  
$hostFile = "apps/host/src/App.jsx"
$content = Get-Content $hostFile
$content = $content -replace 'http://localhost:3002', 'https://werewolf-mafia-server.onrender.com'
$content = $content -replace 'http://localhost:3001', 'https://werewolf-mafia-player.onrender.com'
$content | Set-Content $hostFile

Write-Host "✅ URLs switched to production" -ForegroundColor Green
Write-Host "Server: https://werewolf-mafia-server.onrender.com" -ForegroundColor Yellow
Write-Host "Host:   https://werewolf-mafia-host.onrender.com" -ForegroundColor Yellow  
Write-Host "Player: https://werewolf-mafia-player.onrender.com" -ForegroundColor Yellow
Write-Host ""
Write-Host "Ready for deployment:" -ForegroundColor Cyan
Write-Host "git add . && git commit -m 'Update' && git push origin main" -ForegroundColor Gray 