# Render.com Deployment Guide

This guide explains how to deploy the Werewolf Mafia monorepo to Render.com using optimized pnpm workspace configurations.

## 🚀 Quick Deploy with Blueprint

The easiest way to deploy is using the provided Render Blueprint:

1. Fork or push this repo to GitHub
2. Connect your GitHub account to Render.com
3. Create a new Blueprint deployment
4. Upload the `render.yaml` file from this repo
5. Render will automatically create and deploy all 3 services

## 🔧 Manual Deployment Configuration

If you prefer to set up each service manually:

### 1. Server (Web Service)

**Service Type:** Web Service  
**Environment:** Node  
**Build Command:**
```bash
corepack enable && corepack prepare pnpm@10.11.1 --activate && pnpm install --filter=@werewolf-mafia/server... --frozen-lockfile
```

**Start Command:**
```bash
cd apps/server && pnpm start
```

**Environment Variables:**
- `NODE_ENV` = `production`
- `HOST_URL` = (Will be set automatically to host service URL)
- `PLAYER_URL` = (Will be set automatically to player service URL)

### 2. Host App (Static Site)

**Service Type:** Static Site  
**Build Command:**
```bash
corepack enable && corepack prepare pnpm@10.11.1 --activate && pnpm install --filter=@werewolf-mafia/host... --frozen-lockfile && pnpm build --filter=@werewolf-mafia/host
```

**Publish Directory:** `apps/host/dist`

**Environment Variables:**
- `VITE_SERVER_URL` = (Will be set automatically to server service URL)
- `VITE_PLAYER_URL` = (Will be set automatically to player service URL)

### 3. Player App (Static Site)

**Service Type:** Static Site  
**Build Command:**
```bash
corepack enable && corepack prepare pnpm@10.11.1 --activate && pnpm install --filter=@werewolf-mafia/player... --frozen-lockfile && pnpm build --filter=@werewolf-mafia/player
```

**Publish Directory:** `apps/player/dist`

**Environment Variables:**
- `VITE_SERVER_URL` = (Will be set automatically to server service URL)

## 🔑 Key Optimizations

### ✅ Proper pnpm Workspace Handling
- Uses `corepack` to ensure consistent pnpm version (10.11.1)
- Uses filtered installs (`--filter=appname...`) for optimized builds
- Preserves workspace dependencies instead of copying shared code

### ✅ Environment-Based Configuration
- Frontend apps dynamically connect to server via `VITE_SERVER_URL`
- Server accepts CORS requests from environment-configured URLs
- No hardcoded URLs in production builds

### ✅ Static Site Optimization
- Host and Player apps deploy as Static Sites (faster, cheaper)
- Only server runs as Web Service (needs Node.js runtime)
- Optimal resource allocation for each service type

## 🌐 Environment Variables Explained

### Server Variables
- `HOST_URL` - Used for CORS configuration to allow host app connections
- `PLAYER_URL` - Used for CORS configuration to allow player app connections
- `NODE_ENV` - Set to `production` for optimized server behavior

### Frontend Variables
- `VITE_SERVER_URL` - Points frontend apps to the server for Socket.io connections
- `VITE_PLAYER_URL` - Used by host app to generate QR codes and player links

## 🔄 Deployment Workflow

1. **Code Changes** → Push to your Git repository
2. **Automatic Builds** → Render detects changes and rebuilds affected services
3. **Service Dependencies** → Environment variables automatically link services
4. **Zero-Downtime** → Rolling deployments ensure continuous availability

## 🐛 Troubleshooting

### Build Failures
- Check that pnpm version matches (currently 10.11.1)
- Verify all workspace dependencies are properly defined in package.json files
- Ensure build commands use correct filtered install syntax

### Connection Issues
- Verify environment variables are properly set
- Check server logs for CORS errors
- Ensure WebSocket connections are enabled (Render supports this by default)

### Performance Issues
- Monitor build times - consider adding build caching if needed
- Check if static assets are properly cached
- Verify that only necessary dependencies are installed per service

## 📊 Service Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Host App      │    │   Player App    │    │     Server      │
│  (Static Site)  │    │  (Static Site)  │    │  (Web Service)  │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │ React/Vite  │ │    │ │ React/Vite  │ │    │ │ Node.js     │ │
│ │ Build       │ │    │ │ Build       │ │    │ │ Socket.io   │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────── WebSocket Connections ────────────────┘
```

## 💰 Cost Optimization

- **Static Sites**: ~$0/month (within free tier limits)
- **Web Service**: ~$7/month for basic plan
- **Total**: ~$7/month for the entire game platform

This is significantly cheaper than running 3 separate web services!

## 🚀 Post-Deployment

After deployment, your services will be available at:
- Server: `https://werewolf-mafia-server.onrender.com`
- Host: `https://werewolf-mafia-host.onrender.com`  
- Player: `https://werewolf-mafia-player.onrender.com`

The apps will automatically configure themselves to use these URLs for inter-service communication. 