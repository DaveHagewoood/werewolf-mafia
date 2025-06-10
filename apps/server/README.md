# Werewolf Mafia Server

This is the Socket.io server for the Werewolf Mafia game. It handles real-time game state, player actions, and communication between host and players.

## Deployment on Railway

### Environment Variables

Set these environment variables in your Railway deployment:

- `PORT` - Railway will automatically set this
- `NODE_ENV` - Set to `production`
- `HOST_URL` - URL of your deployed host app (e.g., `https://your-host-app.netlify.app`)
- `PLAYER_URL` - URL of your deployed player app (e.g., `https://your-player-app.netlify.app`)

### Dependencies

The server includes its own copy of shared code (`shared.js`) to avoid npm workspace dependencies that don't work well with Railway deployment.

### CORS Configuration

The server is configured to accept connections from:
- `http://localhost:3000` (development host)
- `http://localhost:3001` (development player)
- Your production URLs via environment variables

## Game Features

- Supports both Werewolf and Mafia game variants
- Real-time Socket.io communication
- Role-based night/day phases
- Voting and elimination mechanics
- Dynamic role assignment based on player count

## Local Development

```bash
npm install
npm start
```

Server will run on port 3002 by default. 