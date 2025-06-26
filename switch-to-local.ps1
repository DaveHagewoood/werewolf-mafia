Write-Host "Switching to LOCAL TESTING mode..." -ForegroundColor Green

# Update server CORS
$serverFile = "apps/server/index.js"
$content = Get-Content $serverFile
$content = $content -replace 'https://werewolf-mafia-host\.onrender\.com', 'http://localhost:3000'
$content = $content -replace 'https://werewolf-mafia-player\.onrender\.com', 'http://localhost:3001'
$content | Set-Content $serverFile

# Update player app
$playerFile = "apps/player/src/App.jsx"
$content = Get-Content $playerFile
$content = $content -replace 'https://werewolf-mafia-server\.onrender\.com', 'http://localhost:3002'
$content | Set-Content $playerFile

# Update host app  
$hostFile = "apps/host/src/App.jsx"
$content = Get-Content $hostFile
$content = $content -replace 'https://werewolf-mafia-server\.onrender\.com', 'http://localhost:3002'
$content = $content -replace 'https://werewolf-mafia-player\.onrender\.com', 'http://localhost:3001'
$content | Set-Content $hostFile

Write-Host "✅ URLs switched to localhost" -ForegroundColor Green
Write-Host "Server: http://localhost:3002" -ForegroundColor Yellow
Write-Host "Host:   http://localhost:3000" -ForegroundColor Yellow  
Write-Host "Player: http://localhost:3001" -ForegroundColor Yellow
Write-Host ""
Write-Host "To start local development:" -ForegroundColor Cyan
Write-Host "1. cd apps/server && npm start" -ForegroundColor Gray
Write-Host "2. cd apps/host && npm start" -ForegroundColor Gray
Write-Host "3. cd apps/player && npm start" -ForegroundColor Gray 