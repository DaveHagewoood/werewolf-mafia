# Werewolf Mafia Game - Documentation

## Architecture Status: Pure Host-Authoritative ✅

This project implements a **pure host-authoritative architecture** where:
- **Host** is the single source of truth for all game state
- **Server** acts as a pure relay for communications
- **Players** receive state updates only from host (via server relay)
- **No circular state loops** or backwards flow from server to host

## Quick Start

### Local Development (Recommended)
```bash
# Terminal 1 - Server
cd apps/server && npm start

# Terminal 2 - Host
cd apps/host && npm run dev

# Terminal 3 - Player
cd apps/player && npm run dev
```

**URLs:**
- **Server**: `localhost:3002`
- **Host**: `localhost:3000`  
- **Player**: `localhost:3001`

## Recent Fixes ✅

### Disconnection/Reconnection System
- **Lobby Disconnections**: Players are immediately removed when they disconnect
- **Active Game Disconnections**: Game pauses when players disconnect, resumes when they reconnect
- **Refresh During Game**: Players can refresh their browser and reconnect seamlessly with full state
- **Reconnection Tokens**: Automatic secure reconnection for existing players

### Connection Management
- **"Try Again" Button**: Now works properly for reconnection attempts
- **Infinite Loop Prevention**: Fixed reconnection loops that could occur
- **State Synchronization**: Server knows current game phase for proper disconnect handling

## Game Rules

### Active Game Rule
Once the game starts (role confirmation phase until player death/game end):
- **If a player disconnects**: Game pauses immediately
- **Player can reconnect**: Game resumes automatically when all players return
- **Player can't return**: Host can end the game prematurely
- **Seamless reconnection**: Players retain their role, alive status, and game progress

### Lobby Rule  
- **Player disconnects in lobby**: Immediately removed from player list
- **Host can start game**: Only when all players are connected and ready

## Documentation

### Architecture & Implementation
- **[Pure State Implementation Plan](./PURE_STATE_IMPLEMENTATION_PLAN.md)** - Technical implementation details
- **[State-Based Architecture](./STATE_BASED_ARCHITECTURE.md)** - Architecture philosophy and design
- **[Progress Summary](./PROGRESS_SUMMARY.md)** - Latest accomplishments and status
- **[API Reference](./API_REFERENCE.md)** - Complete API documentation

## Testing Disconnection Scenarios

### Test 1: Lobby Disconnection
1. Create game room (host)
2. Have player join
3. Player closes browser tab
4. Verify player is immediately removed from lobby
5. Host can start game with remaining players

### Test 2: Active Game Reconnection
1. Start game and progress to night phase
2. Player refreshes browser during night phase
3. Verify game pauses with "Player disconnected" message
4. Player rejoins same room with same name
5. Verify player reconnects with correct role and alive status
6. Verify game resumes automatically

### Test 3: Multiple Disconnections
1. Start game with 4+ players
2. Have 2 players disconnect simultaneously
3. Verify game pauses
4. Have players reconnect one by one
5. Verify game resumes when all players return

## Current Status

✅ **Production Ready**: Pure host-authoritative architecture implemented
✅ **Disconnection System**: Complete lobby and active game disconnect handling  
✅ **Reconnection System**: Seamless reconnection with state preservation
✅ **Local Development**: Optimized for fast iteration cycles
✅ **Documentation**: Comprehensive architecture and implementation docs

## Architecture Benefits

### For Developers
- **Single Source of Truth**: Host controls all game logic
- **Simple Debugging**: No circular state loops to debug
- **Predictable Flow**: Host → Server → Players (one direction)
- **Fast Iteration**: Local development setup

### For Players
- **Reliable Reconnection**: Can refresh browser without losing progress
- **Fair Gameplay**: Host controls prevent cheating
- **Immediate Feedback**: Lobby disconnections handled instantly
- **Game Continuity**: Active games pause/resume properly

---

**Next Steps**: Continue with final testing and performance optimization. 