# Werewolf Mafia Server

This is the Socket.io server for the Werewolf Mafia game. It handles real-time game state, player actions, and communication between host and players.

## Deployment on Render.com

### Build Command
```bash
corepack enable && corepack prepare pnpm@10.11.1 --activate && pnpm install --filter=@werewolf-mafia/server... --frozen-lockfile
```

### Start Command
```bash
cd apps/server && pnpm start
```

### Environment Variables

Set these environment variables in your Render deployment:

- `PORT` - Render will automatically set this
- `NODE_ENV` - Set to `production`
- `HOST_URL` - URL of your deployed host app (e.g., `https://werewolf-mafia-host.onrender.com`)
- `PLAYER_URL` - URL of your deployed player app (e.g., `https://werewolf-mafia-player.onrender.com`)

### Dependencies

The server now uses the proper workspace dependency `@werewolf-mafia/shared` instead of a copied shared.js file. This is handled automatically by the pnpm workspace filtering during build.

### CORS Configuration

The server is configured to accept connections from:
- `http://localhost:3000` (development host)
- `http://localhost:3001` (development player) 
- `https://werewolf-host.serveo.net` (Serveo host URL for tunneling)
- `https://werewolf-player.serveo.net` (Serveo player URL for tunneling)
- Your production URLs via `HOST_URL` and `PLAYER_URL` environment variables

## Game Features

- Supports both Werewolf and Mafia game variants
- Real-time Socket.io communication
- Role-based night/day phases
- Voting and elimination mechanics
- Dynamic role assignment based on player count
- Connection management and game pause/resume
- Player reconnection handling

## Local Development

```bash
# From workspace root
pnpm dev:server

# Or from server directory
cd apps/server
pnpm install
pnpm start
```

Server will run on port 3002 by default. 