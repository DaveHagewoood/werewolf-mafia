# API Reference - Werewolf Mafia State-Based Architecture

## Overview
This document provides a complete reference for the state-based architecture API, including server events, client events, and data structures.

## Server Events (Outbound)

### GAME_STATE_UPDATE
**Target**: Player clients  
**Purpose**: Primary state synchronization for players  
**Frequency**: On every state change

```javascript
{
  type: 'GAME_STATE_UPDATE',
  payload: {
    // Player-specific game state
    gamePhase: 'LOBBY' | 'ROLE_ASSIGNMENT' | 'NIGHT_PHASE' | 'DAY_PHASE' | 'VOTING_PHASE' | 'GAME_OVER',
    playerRole: 'VILLAGER' | 'MAFIA' | 'DOCTOR' | 'SEER',
    isAlive: boolean,
    
    // Voting state (phase-specific)
    canVote: boolean,
    votingOptions: Array<{playerId: string, name: string}>,
    timeRemaining: number,
    hasVoted: boolean,
    
    // Role-specific information
    canHeal: boolean, // Doctor only
    canInvestigate: boolean, // Seer only
    investigationResult: string | null, // Seer only
    isHealed: boolean,
    
    // Game information
    alivePlayers: Array<{id: string, name: string, profileImage: string}>,
    eliminatedPlayers: Array<{id: string, name: string, profileImage: string}>,
    
    // Phase-specific data
    phaseData: {
      // NIGHT_PHASE
      nightPhaseComplete?: boolean,
      mafiaVoteComplete?: boolean,
      doctorHealComplete?: boolean,
      seerInvestigateComplete?: boolean,
      
      // DAY_PHASE
      eliminatedPlayer?: {id: string, name: string},
      
      // VOTING_PHASE
      accusations?: Array<{accuser: string, accused: string}>,
      voteCounts?: {[playerId: string]: number}
    }
  }
}
```

### host-game-state-update
**Target**: Host client  
**Purpose**: Complete game state for host control  
**Frequency**: On every state change

```javascript
{
  type: 'host-game-state-update',
  payload: {
    gamePhase: 'LOBBY' | 'ROLE_ASSIGNMENT' | 'NIGHT_PHASE' | 'DAY_PHASE' | 'VOTING_PHASE' | 'GAME_OVER',
    players: Array<{
      id: string,
      name: string,
      profileImage: string,
      role: 'VILLAGER' | 'MAFIA' | 'DOCTOR' | 'SEER' | null,
      isAlive: boolean,
      isReady: boolean
    }>,
    
    // Phase-specific host data
    gameData: {
      // ROLE_ASSIGNMENT
      playerReadiness?: Array<{playerId: string, ready: boolean}>,
      
      // NIGHT_PHASE
      mafiaVotes?: {[targetId: string]: string[]}, // targetId -> [voterIds]
      doctorHeal?: string | null, // playerId being healed
      seerInvestigation?: string | null, // playerId being investigated
      
      // DAY_PHASE
      eliminatedPlayer?: {id: string, name: string, role: string},
      
      // VOTING_PHASE
      accusations?: Array<{accuser: string, accused: string}>,
      votes?: {[accusedId: string]: string[]}, // accusedId -> [voterIds]
      
      // GAME_OVER
      winner?: 'MAFIA' | 'VILLAGERS',
      reason?: string
    },
    
    // Game settings
    settings: {
      maxPlayers: number,
      minPlayers: number,
      timeouts: {
        roleConfirmation: number,
        nightPhase: number,
        dayPhase: number,
        votingPhase: number
      }
    }
  }
}
```

### Legacy Events (Backward Compatibility)
```javascript
// PLAYERS_UPDATE - for host compatibility during transition
{
  type: 'PLAYERS_UPDATE',
  payload: {
    players: Array<{id: string, name: string, profileImage: string}>
  }
}
```

## Client Events (Inbound)

### Player Client Events

#### JOIN_ROOM
```javascript
{
  type: 'JOIN_ROOM',
  payload: {
    roomId: string,
    playerName: string,
    profileImage: string
  }
}
```

#### CONFIRM_ROLE
```javascript
{
  type: 'CONFIRM_ROLE',
  payload: {
    playerId: string
  }
}
```

#### MAFIA_VOTE
```javascript
{
  type: 'MAFIA_VOTE',
  payload: {
    playerId: string, // voter
    targetId: string  // target
  }
}
```

#### DOCTOR_HEAL
```javascript
{
  type: 'DOCTOR_HEAL',
  payload: {
    playerId: string, // doctor
    targetId: string  // heal target
  }
}
```

#### SEER_INVESTIGATE
```javascript
{
  type: 'SEER_INVESTIGATE',
  payload: {
    playerId: string, // seer
    targetId: string  // investigation target
  }
}
```

#### ACCUSE_PLAYER
```javascript
{
  type: 'ACCUSE_PLAYER',
  payload: {
    accuserId: string,
    accusedId: string
  }
}
```

#### VOTE_PLAYER
```javascript
{
  type: 'VOTE_PLAYER',
  payload: {
    voterId: string,
    accusedId: string
  }
}
```

### Host Client Events

#### CREATE_ROOM
```javascript
{
  type: 'CREATE_ROOM',
  payload: {
    gameType: 'WEREWOLF' | 'MAFIA',
    maxPlayers: number
  }
}
```

#### START_GAME
```javascript
{
  type: 'START_GAME',
  payload: {
    roomId: string
  }
}
```

#### ADVANCE_PHASE
```javascript
{
  type: 'ADVANCE_PHASE',
  payload: {
    roomId: string,
    nextPhase: string
  }
}
```

## Data Structures

### Game State Structure
```javascript
const gameState = {
  // Core game info
  roomId: string,
  gamePhase: 'LOBBY' | 'ROLE_ASSIGNMENT' | 'NIGHT_PHASE' | 'DAY_PHASE' | 'VOTING_PHASE' | 'GAME_OVER',
  gameType: 'WEREWOLF' | 'MAFIA',
  
  // Players
  players: Map<string, {
    id: string,
    name: string,
    profileImage: string,
    role: 'VILLAGER' | 'MAFIA' | 'DOCTOR' | 'SEER' | null,
    isAlive: boolean,
    isReady: boolean,
    socketId: string
  }>,
  
  // Phase-specific state
  currentVotes: Map<string, string>, // voterId -> targetId
  accusations: Array<{accuser: string, accused: string}>,
  eliminatedPlayers: Array<string>, // player IDs
  
  // Night phase state
  mafiaVotes: Map<string, string>, // mafiaId -> targetId
  doctorHeal: string | null, // playerId being healed
  seerInvestigation: string | null, // playerId being investigated
  
  // Timing
  phaseStartTime: number,
  phaseTimeout: number,
  
  // Settings
  settings: {
    maxPlayers: number,
    minPlayers: number,
    timeouts: {
      roleConfirmation: 30000,
      nightPhase: 60000,
      dayPhase: 120000,
      votingPhase: 90000
    }
  }
}
```

### Player State View Structure
```javascript
const playerState = {
  // Player identity
  playerId: string,
  playerName: string,
  playerRole: string,
  isAlive: boolean,
  
  // Game context
  gamePhase: string,
  alivePlayers: Array<{id: string, name: string, profileImage: string}>,
  eliminatedPlayers: Array<{id: string, name: string, profileImage: string}>,
  
  // Voting capabilities
  canVote: boolean,
  votingOptions: Array<{playerId: string, name: string}>,
  hasVoted: boolean,
  timeRemaining: number,
  
  // Role-specific
  canHeal: boolean,
  canInvestigate: boolean,
  investigationResult: string | null,
  isHealed: boolean,
  
  // Phase data
  phaseData: {
    nightPhaseComplete: boolean,
    eliminatedPlayer: {id: string, name: string} | null,
    accusations: Array<{accuser: string, accused: string}>,
    voteCounts: {[playerId: string]: number}
  }
}
```

## GameStateManager API

### Core Methods

#### updateGameState(roomId, newState)
```javascript
/**
 * Updates the game state for a room and broadcasts to clients
 * @param {string} roomId - Room identifier
 * @param {Object} newState - New state object or state update function
 * @returns {Object} Updated game state
 */
GameStateManager.updateGameState(roomId, (currentState) => ({
  ...currentState,
  gamePhase: 'NIGHT_PHASE',
  phaseStartTime: Date.now()
}));
```

#### getGameState(roomId)
```javascript
/**
 * Retrieves current game state for a room
 * @param {string} roomId - Room identifier
 * @returns {Object|null} Game state or null if not found
 */
const state = GameStateManager.getGameState(roomId);
```

#### getPlayerGameState(playerId, gameState, helpers)
```javascript
/**
 * Generates player-specific state view
 * @param {string} playerId - Player identifier
 * @param {Object} gameState - Full game state
 * @param {Object} helpers - Helper functions
 * @returns {Object} Player-specific state
 */
const playerState = GameStateManager.getPlayerGameState(playerId, gameState, {
  getAlivePlayers,
  getMafiaPlayers,
  getAliveNonMafiaPlayers
});
```

#### getHostGameState(gameState)
```javascript
/**
 * Generates host-specific state view
 * @param {Object} gameState - Full game state
 * @returns {Object} Host-specific state
 */
const hostState = GameStateManager.getHostGameState(gameState);
```

### Helper Functions

#### getAlivePlayers(players)
```javascript
/**
 * Filters for alive players
 * @param {Map} players - Players map
 * @returns {Array} Array of alive players
 */
const alivePlayers = getAlivePlayers(gameState.players);
```

#### getMafiaPlayers(players)
```javascript
/**
 * Filters for mafia players
 * @param {Map} players - Players map
 * @returns {Array} Array of mafia players
 */
const mafiaPlayers = getMafiaPlayers(gameState.players);
```

#### getAliveNonMafiaPlayers(players)
```javascript
/**
 * Filters for alive non-mafia players
 * @param {Map} players - Players map
 * @returns {Array} Array of alive non-mafia players
 */
const villagers = getAliveNonMafiaPlayers(gameState.players);
```

## Error Handling

### Standard Error Response
```javascript
{
  type: 'ERROR',
  payload: {
    code: string,
    message: string,
    details?: any
  }
}
```

### Common Error Codes
- `ROOM_NOT_FOUND`: Room ID doesn't exist
- `PLAYER_NOT_FOUND`: Player ID doesn't exist
- `INVALID_PHASE`: Action not allowed in current phase
- `INVALID_ROLE`: Player doesn't have required role
- `ALREADY_VOTED`: Player has already voted
- `GAME_FULL`: Room has reached maximum players

## Reconnection API

### Reconnection Token
```javascript
const reconnectToken = {
  playerId: string,
  roomId: string,
  expiresAt: number, // timestamp
  issued: number     // timestamp
}
```

### Reconnection Event
```javascript
{
  type: 'RECONNECT',
  payload: {
    token: string,
    socketId: string
  }
}
```

## State Transitions

### Phase Progression
```
LOBBY → ROLE_ASSIGNMENT → NIGHT_PHASE → DAY_PHASE → VOTING_PHASE → GAME_OVER
                           ↑___________________________|
```

### Vote Consensus Logic
```javascript
// Mafia vote consensus
const mafiaVoteConsensus = (mafiaVotes, mafiaPlayers) => {
  const totalMafia = mafiaPlayers.length;
  const votesByTarget = groupVotesByTarget(mafiaVotes);
  
  for (const [targetId, votes] of Object.entries(votesByTarget)) {
    if (votes.length > totalMafia / 2) {
      return targetId; // Consensus reached
    }
  }
  return null; // No consensus
};
```

---

**Last Updated**: [Current Date]  
**Version**: 1.0  
**Status**: Active Development 