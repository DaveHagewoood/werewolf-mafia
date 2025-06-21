import { SOCKET_EVENTS, GameConnectionState, getPlayerGameState, GAME_STATES } from '@werewolf-mafia/shared';

export class GameStateManager {
  constructor(io) {
    this.io = io;
    this.roomStates = new Map();
  }

  initializeRoom(roomId, gameType = null) {
    this.roomStates.set(roomId, {
      connectionState: GameConnectionState.ACTIVE,
      gameState: GAME_STATES.LOBBY,
      gameType: gameType,
      players: [],
      playerRoles: new Map(),
      playerReadiness: new Map(),
      alivePlayers: new Set(),
      mafiaVotes: new Map(),
      accusations: new Map(),
      reconnectingPlayers: new Set(),
      gamePaused: false,
      pauseReason: null,
      eliminatedPlayer: null,
      savedPlayer: null,
      eliminationCountdown: null,
      dayEliminatedPlayer: null,
      winner: null,
      winCondition: null,
      consensusTimer: null,
      nightActionResults: new Map(),
      votingData: new Map()
    });
    
    console.log(`GameStateManager: Initialized room ${roomId} with game type ${gameType}`);
  }

  getRoom(roomId) {
    return this.roomStates.get(roomId);
  }

  updateGameState(roomId, updates) {
    const state = this.roomStates.get(roomId);
    if (!state) {
      console.error(`GameStateManager: Room ${roomId} not found for update`);
      return false;
    }

    console.log(`GameStateManager: Updating state for room ${roomId}:`, Object.keys(updates));

    // Apply updates
    Object.entries(updates).forEach(([key, value]) => {
      if (value instanceof Map) {
        state[key] = new Map(value);
      } else if (value instanceof Set) {
        state[key] = new Set(value);
      } else {
        state[key] = value;
      }
    });

    // Broadcast updated state to all players
    this.broadcastGameState(roomId);
    return true;
  }

  broadcastGameState(roomId) {
    const state = this.roomStates.get(roomId);
    if (!state) {
      console.error(`GameStateManager: Room ${roomId} not found for broadcast`);
      return;
    }

    console.log(`GameStateManager: Broadcasting state for room ${roomId}, gameState: ${state.gameState}, players: ${state.players.length}`);

    // Send state to each player
    state.players.forEach(player => {
      const playerState = getPlayerGameState(state, player.id, {
        getAliveNonMafiaPlayers: (room) => this.getAliveNonMafiaPlayers(room),
        getMafiaPlayers: (room) => this.getMafiaPlayers(room)
      });
      this.io.to(player.id).emit(SOCKET_EVENTS.GAME_STATE_UPDATE, playerState);
    });

    // Also send to host if it exists
    if (state.host) {
      // Host gets a fuller view of the game state
      const hostState = this.getHostGameState(state);
      this.io.to(state.host).emit('host-game-state-update', hostState);
    }
  }

  // Helper function to get host-specific game state
  getHostGameState(room) {
    return {
      gameState: room.gameState,
      players: room.players.map(p => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        role: room.playerRoles.get(p.id),
        isReady: room.playerReadiness.get(p.id) || false,
        alive: room.alivePlayers.has(p.id)
      })),
      gameType: room.gameType,
      gamePaused: room.gamePaused,
      pauseReason: room.pauseReason,
      eliminatedPlayer: room.eliminatedPlayer,
      savedPlayer: room.savedPlayer,
      dayEliminatedPlayer: room.dayEliminatedPlayer,
      accusations: Array.from(room.accusations.entries()),
      eliminationCountdown: room.eliminationCountdown,
      mafiaVotes: Array.from(room.mafiaVotes.entries()),
      winner: room.winner,
      winCondition: room.winCondition
    };
  }

  // Helper functions for game logic
  getAliveNonMafiaPlayers(room) {
    return room.players.filter(player => {
      const isAlive = room.alivePlayers.has(player.id);
      const role = room.playerRoles.get(player.id);
      const isNotMafia = !role || role.alignment !== 'evil';
      return isAlive && isNotMafia;
    });
  }

  getMafiaPlayers(room) {
    return room.players.filter(player => {
      const role = room.playerRoles.get(player.id);
      return role && role.alignment === 'evil';
    });
  }

  getAlivePlayers(room) {
    return room.players.filter(player => room.alivePlayers.has(player.id));
  }

  handlePlayerDisconnect(roomId, playerId) {
    const state = this.roomStates.get(roomId);
    if (!state) return;

    // Don't handle reconnection in lobby
    if (state.gameState === GAME_STATES.LOBBY) return;

    console.log(`GameStateManager: Handling disconnect for player ${playerId} in room ${roomId}`);

    if (!state.reconnectingPlayers) {
      state.reconnectingPlayers = new Set();
    }
    
    state.reconnectingPlayers.add(playerId);
    const player = state.players.find(p => p.id === playerId);
    if (!player) return;

    // Update player connection status
    this.updateGameState(roomId, {
      players: state.players.map(p => 
        p.id === playerId ? { ...p, connected: false } : p
      ),
      gamePaused: state.gameState !== GAME_STATES.ENDED,
      pauseReason: state.gameState !== GAME_STATES.ENDED ? 'Waiting for player reconnection' : null
    });
  }

  handlePlayerReconnect(roomId, playerId, socket) {
    const state = this.roomStates.get(roomId);
    if (!state) return;

    console.log(`GameStateManager: Handling reconnect for player ${playerId} in room ${roomId}`);

    const player = state.players.find(p => p.id === playerId);
    if (!player) return;

    // Update reconnecting players
    if (state.reconnectingPlayers) {
      state.reconnectingPlayers.delete(playerId);
    }

    // Check if all players are back
    const allConnected = state.players.every(p => p.connected || p.id === playerId);

    // Update player connection status and game pause state
    this.updateGameState(roomId, {
      players: state.players.map(p => 
        p.id === playerId ? { ...p, connected: true } : p
      ),
      gamePaused: !allConnected,
      pauseReason: !allConnected ? 'Waiting for player reconnection' : null
    });

    // Send current state to reconnected player immediately
    const playerState = getPlayerGameState(state, playerId, {
      getAliveNonMafiaPlayers: (room) => this.getAliveNonMafiaPlayers(room),
      getMafiaPlayers: (room) => this.getMafiaPlayers(room)
    });
    socket.emit(SOCKET_EVENTS.GAME_STATE_UPDATE, playerState);
  }

  cleanup(roomId) {
    console.log(`GameStateManager: Cleaning up room ${roomId}`);
    this.roomStates.delete(roomId);
  }
} 