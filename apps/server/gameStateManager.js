const { SOCKET_EVENTS } = require('@werewolf-mafia/shared');
const { GameConnectionState } = require('@werewolf-mafia/shared/connectionStates');

class GameStateManager {
  constructor(io) {
    this.io = io;
    this.roomStates = new Map();
    this.stateVersions = new Map();
  }

  initializeRoom(roomId) {
    this.roomStates.set(roomId, {
      connectionState: GameConnectionState.ACTIVE,
      stateVersion: 0,
      lastUpdate: Date.now(),
      reconnectingPlayers: new Set(),
      gameState: null,
      players: [],
      playerRoles: new Map(),
      playerReadiness: new Map(),
      alivePlayers: new Set(),
      mafiaVotes: new Map(),
      accusations: new Map(),
      gamePaused: false,
      pauseReason: null
    });
  }

  getFullGameState(roomId) {
    const state = this.roomStates.get(roomId);
    if (!state) return null;

    return {
      version: state.stateVersion,
      timestamp: state.lastUpdate,
      connectionState: state.connectionState,
      gameState: state.gameState,
      players: state.players,
      playerRoles: Array.from(state.playerRoles.entries()),
      playerReadiness: Array.from(state.playerReadiness.entries()),
      alivePlayers: Array.from(state.alivePlayers),
      mafiaVotes: Array.from(state.mafiaVotes.entries()),
      accusations: Array.from(state.accusations.entries()),
      gamePaused: state.gamePaused,
      pauseReason: state.pauseReason
    };
  }

  updateGameState(roomId, updates) {
    const state = this.roomStates.get(roomId);
    if (!state) return;

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

    // Update metadata
    state.stateVersion++;
    state.lastUpdate = Date.now();

    // Broadcast state update to all players
    this.broadcastGameState(roomId);
  }

  handlePlayerDisconnect(roomId, playerId) {
    const state = this.roomStates.get(roomId);
    if (!state) return;

    state.reconnectingPlayers.add(playerId);

    if (state.connectionState === GameConnectionState.ACTIVE &&
        state.gameState !== 'LOBBY' && 
        state.gameState !== 'ENDED') {
      
      state.connectionState = GameConnectionState.PAUSED_RECONNECTING;
      state.gamePaused = true;
      state.pauseReason = 'Waiting for player reconnection';
      
      this.io.to(roomId).emit(SOCKET_EVENTS.GAME_PAUSED, {
        reason: state.pauseReason,
        disconnectedPlayer: playerId,
        reconnectTimeLeft: 30000 // 30 seconds timeout
      });
    }
  }

  handlePlayerReconnect(roomId, playerId, socket) {
    const state = this.roomStates.get(roomId);
    if (!state) return;

    state.reconnectingPlayers.delete(playerId);

    // Send full state to reconnected player
    const fullState = this.getFullGameState(roomId);
    socket.emit(SOCKET_EVENTS.PLAYER_RECONNECTED, fullState);

    // If all players are back, resume the game
    if (state.reconnectingPlayers.size === 0 && 
        state.connectionState === GameConnectionState.PAUSED_RECONNECTING) {
      
      state.connectionState = GameConnectionState.ACTIVE;
      state.gamePaused = false;
      state.pauseReason = null;
      
      this.io.to(roomId).emit(SOCKET_EVENTS.GAME_RESUMED);
    }
  }

  handleStateSyncRequest(roomId, playerId, clientVersion) {
    const state = this.roomStates.get(roomId);
    if (!state) return;

    if (clientVersion !== state.stateVersion) {
      const fullState = this.getFullGameState(roomId);
      this.io.to(playerId).emit(SOCKET_EVENTS.STATE_SYNC_RESPONSE, fullState);
    }
  }

  broadcastGameState(roomId) {
    const state = this.getFullGameState(roomId);
    if (state) {
      this.io.to(roomId).emit(SOCKET_EVENTS.STATE_SYNC_RESPONSE, state);
    }
  }

  cleanup(roomId) {
    this.roomStates.delete(roomId);
  }
}

module.exports = GameStateManager; 