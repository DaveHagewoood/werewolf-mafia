# 🎮 Werewolf Mafia - Development Setup

## Quick Start (4 Windows Total)

### 🚀 Starting Development

**Option 1: One Command (Recommended)**
```powershell
pnpm start
```

**Option 2: Two Commands**
```powershell
# Window 1 - Start tunnels
pnpm tunnels:start

# Window 2 - Start dev servers  
pnpm dev:all
```

### 🛑 Stopping Everything

```powershell
pnpm stop
```

## What Gets Started

### SSH Tunnels (3 windows)
- **Host Tunnel**: `werewolf-host.serveo.net` → `localhost:3000`
- **Player Tunnel**: `werewolf-player.serveo.net` → `localhost:3001`  
- **Server Tunnel**: `werewolf-server.serveo.net` → `localhost:3002`

### Dev Servers (1 window)
- **Host App**: React dev server on port 3000
- **Player App**: React dev server on port 3001
- **Server**: Node.js server on port 3002

## Your URLs

- 🎮 **Host Game**: https://werewolf-host.serveo.net
- 📱 **Join Game**: https://werewolf-player.serveo.net  
- 🔌 **Server API**: https://werewolf-server.serveo.net

## Individual Commands

```powershell
# Start just tunnels
pnpm tunnels:start

# Start just dev servers
pnpm dev:all

# Start individual apps
pnpm dev:host
pnpm dev:player  
pnpm dev:server

# Stop tunnels
pnpm tunnels:stop
```

## Troubleshooting

### If tunnels fail to start:
```powershell
pnmp stop
# Wait 10 seconds
pnpm tunnels:start
```

### If ports are in use:
Check what's running on ports 3000-3002 and stop those processes.

### If you need different subdomains:
Edit `start-tunnels.ps1` and change the subdomain names. 

## 📡 Tunneling (SSH Required)

To make your local development accessible from anywhere, we use **serveo.net** for SSH tunneling.

### Quick Start
```bash
# Windows PowerShell
./start-tunnels.ps1

# Manual setup (run each in separate terminal)
ssh -R werewolf-host:80:localhost:3000 serveo.net    # Host App
ssh -R werewolf-player:80:localhost:3001 serveo.net  # Player App  
ssh -R werewolf-server:80:localhost:3002 serveo.net  # Server
```

### Tunnel Mapping
- **Host Tunnel**: `https://werewolf-host.serveo.net` → `localhost:3000`
- **Player Tunnel**: `https://werewolf-player.serveo.net` → `localhost:3001`
- **Server Tunnel**: `https://werewolf-server.serveo.net` → `localhost:3002`

### Access Your Apps
- 🎮 **Host Game**: https://werewolf-host.serveo.net
- 📱 **Join Game**: https://werewolf-player.serveo.net  
- 🔌 **Server API**: https://werewolf-server.serveo.net 