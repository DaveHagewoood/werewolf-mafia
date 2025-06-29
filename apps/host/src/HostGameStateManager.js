import { SOCKET_EVENTS, GAME_STATES, GAME_CONFIG, assignRoles, GAME_TYPES, ROLE_SETS, POWERS } from '@werewolf-mafia/shared';

export class HostGameStateManager {
  constructor(socket, roomId, onStateChange = null) {
    this.socket = socket;
    this.roomId = roomId;
    this.onStateChange = onStateChange;
    
    // Initialize timer handles for countdown management
    this.consensusTimerHandle = null;
    this.eliminationTimer = null;
    
    this.gameState = {
      gameState: GAME_STATES.LOBBY,
      gameType: null,
      players: [],
      playerRoles: new Map(),
      playerReadiness: new Map(),
      alivePlayers: new Set(),
      mafiaVotes: new Map(),
      accusations: new Map(),
      eliminatedPlayer: null,
      savedPlayer: null,
      eliminationCountdown: null,
      dayEliminatedPlayer: null,
      winner: null,
      winCondition: null,
      consensusTimer: null,
      nightActionResults: new Map(),
      votingData: new Map(),
      investigationResults: new Map(),
      healActions: new Map(),
      investigationActions: new Map()
    };
    
    console.log(`HostGameStateManager: Initialized for room ${roomId}`);
  }

  updateGameState(updates) {
    console.log(`HostGameStateManager: Updating state:`, Object.keys(updates));

    // Apply updates to local state
    Object.entries(updates).forEach(([key, value]) => {
      if (value instanceof Map) {
        this.gameState[key] = new Map(value);
      } else if (value instanceof Set) {
        this.gameState[key] = new Set(value);
      } else {
        this.gameState[key] = value;
      }
    });

    // Debug log for player updates
    if (updates.players) {
      console.log(`🔄 HostGameStateManager: Players updated - now have ${updates.players.length} players:`, updates.players.map(p => `${p.name}(${p.id})`));
    }

    // Broadcast updated state to players via server
    this.broadcastGameState();
    
    // Notify host's React components of state change
    if (this.onStateChange) {
      this.onStateChange(this.getMasterGameState());
    }
    
    return true;
  }

  broadcastGameState() {
    console.log(`HostGameStateManager: Broadcasting state, gameState: ${this.gameState.gameState}, players: ${this.gameState.players.length}`);

    // Generate the master state
    const masterState = this.getMasterGameState();
    
    // Send state to server for relay to players
    this.socket.emit('host-broadcast-state', {
      roomId: this.roomId,
      gameState: masterState
    });
    
    // Sync critical game state to server for proper disconnect handling
    this.socket.emit('host-sync-game-phase', {
      roomId: this.roomId,
      gamePhase: this.gameState.gameState,
      players: this.gameState.players.map(p => ({ id: p.id, name: p.name }))
    });
  }

  // Generate the single source of truth state
  getMasterGameState() {
    console.log('HOST DEBUG - getMasterGameState() gameType:', this.gameState.gameType);
    
    const masterState = {
      gameState: this.gameState.gameState,
      gameType: this.gameState.gameType,
      
      // Players with all info
      players: this.gameState.players.map(p => ({
        id: p.id,
        name: p.name,
        sessionToken: p.sessionToken,
        profileImage: p.profileImage,
        connected: p.connected,
        lastSeen: p.lastSeen,
        role: this.gameState.playerRoles.get(p.id),
        isReady: this.gameState.playerReadiness.get(p.id) || false,
        alive: this.gameState.alivePlayers.has(p.id)
      })),
      
      // Phase-specific data
      eliminatedPlayer: this.gameState.eliminatedPlayer,
      savedPlayer: this.gameState.savedPlayer,
      dayEliminatedPlayer: this.gameState.dayEliminatedPlayer,
      mostSuspiciousPlayer: this.gameState.mostSuspiciousPlayer,
      accusations: Array.from(this.gameState.accusations.entries()).map(([accusedId, accusers]) => [
        accusedId, 
        Array.from(accusers) // Convert Set to Array for serialization
      ]),
      eliminationCountdown: this.gameState.eliminationCountdown,
      waitingForHostContinue: this.gameState.waitingForHostContinue || false,
      winner: this.gameState.winner,
      winCondition: this.gameState.winCondition,
      
      // Night phase actions
      mafiaVotes: Array.from(this.gameState.mafiaVotes.entries()),
      mafiaVotesLocked: this.gameState.mafiaVotesLocked || false,
      consensusTimer: this.gameState.consensusTimer || null,
      healActions: this.gameState.healActions ? Array.from(this.gameState.healActions.entries()) : [],
      investigationActions: this.gameState.investigationActions ? Array.from(this.gameState.investigationActions.entries()) : [],
      investigationResults: this.gameState.investigationResults ? Array.from(this.gameState.investigationResults.entries()) : [],
      suspicionVotes: this.gameState.suspicionVotes ? Array.from(this.gameState.suspicionVotes.entries()) : []
    };

    // Add available targets for different roles
    if (this.gameState.gameState === GAME_STATES.NIGHT_PHASE) {
      masterState.availableTargets = {
        mafia: this.getAliveNonMafiaPlayers().map(p => ({ id: p.id, name: p.name })),
        doctor: this.gameState.players.filter(p => this.gameState.alivePlayers.has(p.id)).map(p => ({ id: p.id, name: p.name })),
        seer: this.gameState.players.filter(p => this.gameState.alivePlayers.has(p.id)).map(p => ({ id: p.id, name: p.name }))
      };
    }

    // Add day phase voting targets
    if (this.gameState.gameState === GAME_STATES.DAY_PHASE) {
      masterState.dayPhaseTargets = this.gameState.players.filter(p => this.gameState.alivePlayers.has(p.id)).map(p => ({ id: p.id, name: p.name }));
    }

    return masterState;
  }

  // Helper functions for game logic
  getAliveNonMafiaPlayers() {
    return this.gameState.players.filter(player => {
      const isAlive = this.gameState.alivePlayers.has(player.id);
      const role = this.gameState.playerRoles.get(player.id);
      const isNotMafia = !role || role.alignment !== 'evil';
      return isAlive && isNotMafia;
    });
  }

  getMafiaPlayers() {
    return this.gameState.players.filter(player => {
      const role = this.gameState.playerRoles.get(player.id);
      return role && role.alignment === 'evil';
    });
  }

  getAlivePlayers() {
    return this.gameState.players.filter(player => this.gameState.alivePlayers.has(player.id));
  }

  // Game action methods that host calls directly
  selectGameType(gameType) {
    console.log('HOST DEBUG - selectGameType() called with:', gameType);
    this.updateGameState({
      gameType: gameType,
      gameState: GAME_STATES.LOBBY
    });
  }

  addPlayer(playerId, playerName, profileImage, sessionToken = null) {
    // Create new player entry
    const newPlayer = {
      id: playerId,
      name: playerName,
      profileImage: profileImage,
      sessionToken: sessionToken || `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // Temporary token for old system compatibility
      connected: true, // Set as connected when they join
      lastSeen: Date.now() // Track when we last heard from them
    };

    this.updateGameState({
      players: [...this.gameState.players, newPlayer]
    });
    
    console.log(`✅ Player added: ${playerName}`);
  }

  removePlayer(playerId) {
    console.log(`🗑️ HOST: Attempting to remove player with ID: ${playerId}`);
    console.log(`🗑️ HOST: Current players before removal:`, this.gameState.players.map(p => `${p.name}(${p.id})`));
    
    const playerToRemove = this.gameState.players.find(p => p.id === playerId);
    if (!playerToRemove) {
      console.log(`❌ HOST: Player with ID ${playerId} not found in game state!`);
      console.log(`❌ HOST: Available player IDs:`, this.gameState.players.map(p => p.id));
      return;
    }
    
    console.log(`🎯 HOST: Found player to remove: ${playerToRemove.name} (${playerId})`);
    
    const updatedPlayers = this.gameState.players.filter(p => p.id !== playerId);
    console.log(`✅ HOST: Players after removal:`, updatedPlayers.map(p => `${p.name}(${p.id})`));
    
    // Clean up player data
    const newPlayerRoles = new Map(this.gameState.playerRoles);
    const newPlayerReadiness = new Map(this.gameState.playerReadiness);
    const newAlivePlayers = new Set(this.gameState.alivePlayers);
    const newMafiaVotes = new Map(this.gameState.mafiaVotes);
    
    newPlayerRoles.delete(playerId);
    newPlayerReadiness.delete(playerId);
    newAlivePlayers.delete(playerId);
    newMafiaVotes.delete(playerId);

    this.updateGameState({
      players: updatedPlayers,
      playerRoles: newPlayerRoles,
      playerReadiness: newPlayerReadiness,
      alivePlayers: newAlivePlayers,
      mafiaVotes: newMafiaVotes
    });
    
    console.log(`✅ HOST: Player ${playerToRemove.name} successfully removed from game state`);
  }

  // Session-based player reconnection (NEW)
  reconnectPlayerBySession(sessionToken, newSocketId) {
    // Find player by session token
    const playerIndex = this.gameState.players.findIndex(p => p.sessionToken === sessionToken);
    
    if (playerIndex === -1) {
      console.log(`❌ No player found with session token`);
      return false;
    }
    
    const player = this.gameState.players[playerIndex];
    const oldSocketId = player.id;
    
    console.log(`🔄 Reconnecting player ${player.name}: ${oldSocketId} -> ${newSocketId}`);
    
    // Update all game state references from old socket ID to new socket ID
    const updatedPlayers = [...this.gameState.players];
    updatedPlayers[playerIndex] = { ...player, id: newSocketId };
    
    const updates = { players: updatedPlayers };
    
    // Update Maps/Sets that use socket IDs as keys
    ['playerRoles', 'playerReadiness', 'mafiaVotes', 'healActions', 'investigationActions'].forEach(mapName => {
      if (this.gameState[mapName] && this.gameState[mapName].has(oldSocketId)) {
        const newMap = new Map(this.gameState[mapName]);
        const value = newMap.get(oldSocketId);
        newMap.delete(oldSocketId);
        newMap.set(newSocketId, value);
        updates[mapName] = newMap;
      }
    });
    
    // Update alivePlayers Set
    if (this.gameState.alivePlayers.has(oldSocketId)) {
      const newAlivePlayers = new Set(this.gameState.alivePlayers);
      newAlivePlayers.delete(oldSocketId);
      newAlivePlayers.add(newSocketId);
      updates.alivePlayers = newAlivePlayers;
    }
    
    // Update accusations Map (both as accuser and accused)
    if (this.gameState.accusations.size > 0) {
      const newAccusations = new Map();
      this.gameState.accusations.forEach((accusers, accusedId) => {
        const newAccusedId = accusedId === oldSocketId ? newSocketId : accusedId;
        const newAccusers = new Set();
        accusers.forEach(accuserId => {
          const newAccuserId = accuserId === oldSocketId ? newSocketId : accuserId;
          newAccusers.add(newAccuserId);
        });
        newAccusations.set(newAccusedId, newAccusers);
      });
      updates.accusations = newAccusations;
    }
    
    this.updateGameState(updates);
    
    console.log(`✅ Session-based reconnection successful for ${player.name}`);
    return true;
  }

  // Update player socket ID and mark as connected (for both lobby and active game session authentication)
  updatePlayerSocketId(oldSocketId, newSocketId) {
    const playerIndex = this.gameState.players.findIndex(p => p.id === oldSocketId);
    
    if (playerIndex === -1) {
      console.log(`❌ No player found with old socket ID: ${oldSocketId}`);
      return false;
    }
    
    const player = this.gameState.players[playerIndex];
    console.log(`🔄 Updating socket ID for ${player.name}: ${oldSocketId} -> ${newSocketId}`);
    
    // Update the player list
    const updatedPlayers = [...this.gameState.players];
    updatedPlayers[playerIndex] = { 
      ...player, 
      id: newSocketId,
      connected: true,
      lastSeen: Date.now()
    };
    
    const updates = { players: updatedPlayers };
    
    // For active games, also update all game state Maps that use socket IDs as keys
    if (this.gameState.gameState !== GAME_STATES.LOBBY) {
      console.log(`🎮 Active game - updating all game state mappings for ${player.name}`);
      
      // Update Maps/Sets that use socket IDs as keys
      ['playerRoles', 'playerReadiness', 'mafiaVotes', 'healActions', 'investigationActions'].forEach(mapName => {
        if (this.gameState[mapName] && this.gameState[mapName].has(oldSocketId)) {
          const newMap = new Map(this.gameState[mapName]);
          const value = newMap.get(oldSocketId);
          newMap.delete(oldSocketId);
          newMap.set(newSocketId, value);
          updates[mapName] = newMap;
          console.log(`  📝 Updated ${mapName}: ${oldSocketId} -> ${newSocketId}`);
        }
      });
      
      // Update alivePlayers Set
      if (this.gameState.alivePlayers && this.gameState.alivePlayers.has(oldSocketId)) {
        const newAlivePlayers = new Set(this.gameState.alivePlayers);
        newAlivePlayers.delete(oldSocketId);
        newAlivePlayers.add(newSocketId);
        updates.alivePlayers = newAlivePlayers;
        console.log(`  📝 Updated alivePlayers: ${oldSocketId} -> ${newSocketId}`);
      }
      
      // Update accusations Map (both as accuser and accused)
      if (this.gameState.accusations && this.gameState.accusations.size > 0) {
        const newAccusations = new Map();
        this.gameState.accusations.forEach((accusers, accusedId) => {
          const newAccusedId = accusedId === oldSocketId ? newSocketId : accusedId;
          const newAccusers = new Set();
          accusers.forEach(accuserId => {
            const newAccuserId = accuserId === oldSocketId ? newSocketId : accuserId;
            newAccusers.add(newAccuserId);
          });
          newAccusations.set(newAccusedId, newAccusers);
        });
        updates.accusations = newAccusations;
        console.log(`  📝 Updated accusations mapping`);
      }
    }
    
    this.updateGameState(updates);
    
    console.log(`✅ Socket ID updated for ${this.gameState.gameState === GAME_STATES.LOBBY ? 'lobby' : 'active game'} player: ${player.name}`);
    return true;
  }

  // Simple lobby readiness check - no complex grace periods or cleanup
  checkPlayersReady() {
    // For simplified lobby: just check if all players are present
    // Server handles disconnection cleanup, host doesn't need to
    
    return {
      ready: this.gameState.players.length >= GAME_CONFIG.MIN_PLAYERS,
      connected: this.gameState.players.length,
      total: this.gameState.players.length,
      disconnectedPlayers: []
    }
  }

  startGame() {
    if (this.gameState.players.length < GAME_CONFIG.MIN_PLAYERS) {
      throw new Error(`Need at least ${GAME_CONFIG.MIN_PLAYERS} players to start`);
    }

    if (this.gameState.gameState !== GAME_STATES.LOBBY) {
      throw new Error('Game already started');
    }

    // Simple start: if players are in the lobby, they're ready to play

    // Assign roles to players
    const gameType = this.gameState.gameType || 'werewolf';
    console.log('HOST DEBUG - startGame() gameType:', gameType);
    console.log('HOST DEBUG - this.gameState.gameType:', this.gameState.gameType);
    
    const roles = assignRoles(this.gameState.players.length, gameType);
    console.log('HOST DEBUG - assigned roles:', roles.map(r => r.name));
    
    const newPlayerRoles = new Map();
    const newPlayerReadiness = new Map();
    const newAlivePlayers = new Set();
    
    this.gameState.players.forEach((player, index) => {
      newPlayerRoles.set(player.id, roles[index]);
      newPlayerReadiness.set(player.id, false);
      newAlivePlayers.add(player.id);
    });
    
    console.log(`Roles assigned in room ${this.roomId}:`);
    this.gameState.players.forEach(player => {
      const role = newPlayerRoles.get(player.id);
      console.log(`  ${player.name}: ${role.name}`);
    });
    
    this.updateGameState({
      gameState: GAME_STATES.ROLE_ASSIGNMENT,
      playerRoles: newPlayerRoles,
      playerReadiness: newPlayerReadiness,
      alivePlayers: newAlivePlayers
    });

    // Send individual role assignments to players via server
    this.gameState.players.forEach(player => {
      const role = newPlayerRoles.get(player.id);
      this.socket.emit('host-send-to-player', {
        roomId: this.roomId,
        playerId: player.id,
        event: SOCKET_EVENTS.ROLE_ASSIGNED,
        data: {
          role: role,
          playerName: player.name
        }
      });
    });
  }

  // Update player's last seen timestamp (for connection tracking)
  updatePlayerActivity(playerId) {
    const playerIndex = this.gameState.players.findIndex(p => p.id === playerId)
    if (playerIndex !== -1) {
      const updatedPlayers = [...this.gameState.players]
      updatedPlayers[playerIndex] = {
        ...updatedPlayers[playerIndex],
        connected: true,
        lastSeen: Date.now()
      }
      
      this.updateGameState({
        players: updatedPlayers
      })
    }
  }

  // Get a player's role (for reconnection)
  getPlayerRole(playerId) {
    return this.gameState.playerRoles.get(playerId) || null;
  }

  playerReady(playerId) {
    // Update activity tracking
    this.updatePlayerActivity(playerId)

    const newReadiness = new Map(this.gameState.playerReadiness);
    newReadiness.set(playerId, true);
    
    this.updateGameState({
      playerReadiness: newReadiness
    });
    
    console.log(`Player ${playerId} is ready in room ${this.roomId}`);
    
    // Check if all CONNECTED players are ready (ignore disconnected players)
    const connectedPlayers = this.gameState.players.filter(player => player.connected !== false);
    const allConnectedReady = connectedPlayers.every(player => {
      return newReadiness.get(player.id) === true;
    });
    
    console.log(`Role assignment progress: ${connectedPlayers.filter(p => newReadiness.get(p.id)).length}/${connectedPlayers.length} connected players ready`);
    
    if (allConnectedReady) {
      console.log(`All connected players ready in room ${this.roomId}, starting night phase`);
      this.startNightPhase();
    }
  }

  startNightPhase() {
    // Check for inevitable victory before starting night phase
    if (this.checkInevitableVictory()) {
      return; // Game ended due to inevitable victory
    }
    
    this.updateGameState({
      gameState: GAME_STATES.NIGHT_PHASE,
      mafiaVotes: new Map(),
      healActions: new Map(),
      investigationActions: new Map(),
      suspicionVotes: new Map(),
      mafiaVotesLocked: false,
      eliminatedPlayer: null,
      savedPlayer: null,
      mostSuspiciousPlayer: null
    });
    
    console.log(`Night phase started in room ${this.roomId}`);
  }

  // Handle player actions
  processMafiaVote(playerId, targetId) {
    // Update activity tracking
    this.updatePlayerActivity(playerId)

    // Verify player is Mafia
    const playerRole = this.gameState.playerRoles.get(playerId);
    if (playerRole?.alignment !== 'evil') {
      throw new Error('Only Mafia can vote during night phase');
    }

    if (this.gameState.mafiaVotesLocked) {
      throw new Error('Voting is locked - consensus has been reached');
    }

    const newMafiaVotes = new Map(this.gameState.mafiaVotes);
    
    if (targetId === null || this.gameState.mafiaVotes.get(playerId) === targetId) {
      // Remove vote
      newMafiaVotes.delete(playerId);
    } else {
      // Add/change vote
      if (!this.gameState.alivePlayers.has(targetId)) {
        throw new Error('Invalid target');
      }
      newMafiaVotes.set(playerId, targetId);
    }

    let updates = { mafiaVotes: newMafiaVotes };

    // Clear existing consensus timer if any
    if (this.consensusTimerHandle) {
      clearTimeout(this.consensusTimerHandle);
      this.consensusTimerHandle = null;
      updates.consensusTimer = null;
    }

    // Check for consensus
    const consensusTarget = this.checkMafiaVoteConsensus(newMafiaVotes);
    if (consensusTarget) {
      const targetPlayer = this.gameState.players.find(p => p.id === consensusTarget);
      console.log(`Mafia consensus reached for ${targetPlayer?.name}`);
      
      updates.consensusTimer = {
        targetId: consensusTarget,
        targetName: targetPlayer?.name,
        timeLeft: Math.floor(GAME_CONFIG.MAFIA_VOTE_CONSENSUS_TIME / 1000)
      };
      
      // Start consensus timer and store handle
      this.consensusTimerHandle = setTimeout(() => {
        this.consensusTimerHandle = null;
        this.updateGameState({
          mafiaVotesLocked: true,
          consensusTimer: null
        });
        this.checkNightCompletion();
      }, GAME_CONFIG.MAFIA_VOTE_CONSENSUS_TIME);
    }

    this.updateGameState(updates);
  }

  processDoctorHeal(playerId, targetId) {
    // Update activity tracking
    this.updatePlayerActivity(playerId)

    const playerRole = this.gameState.playerRoles.get(playerId);
    
    if (playerRole?.power !== POWERS.HEAL) {
      throw new Error(`Only players with heal power can heal during night phase`);
    }

    if (!this.gameState.alivePlayers.has(targetId)) {
      throw new Error('Invalid heal target');
    }

    const currentHealActions = new Map(this.gameState.healActions);
    currentHealActions.set(playerId, targetId);
    
    this.updateGameState({
      healActions: currentHealActions,
      healedPlayerId: targetId
    });
    
    this.checkNightCompletion();
  }

  processSeerInvestigation(playerId, targetId) {
    // Update activity tracking
    this.updatePlayerActivity(playerId)

    const playerRole = this.gameState.playerRoles.get(playerId);
    
    if (playerRole?.power !== POWERS.INVESTIGATE) {
      throw new Error(`Only players with investigate power can investigate during night phase`);
    }

    if (!this.gameState.alivePlayers.has(targetId)) {
      throw new Error('Invalid investigation target');
    }

    const targetPlayer = this.gameState.players.find(p => p.id === targetId);
    const targetRole = this.gameState.playerRoles.get(targetId);
    
    // Store structured result instead of just a string message
    const resultData = {
      targetId: targetId,
      targetName: targetPlayer?.name || 'Unknown',
      alignment: targetRole?.alignment || 'unknown'
    };
    
    const currentResults = new Map(this.gameState.investigationResults);
    currentResults.set(playerId, resultData);
    
    const currentInvestigationActions = new Map(this.gameState.investigationActions);
    currentInvestigationActions.set(playerId, targetId);
    
    this.updateGameState({
      investigationActions: currentInvestigationActions,
      investigationResults: currentResults,
      seerInvestigatedPlayerId: targetId
    });
    
    this.checkNightCompletion();
  }

  processSuspicionVote(playerId, targetId) {
    // Update activity tracking
    this.updatePlayerActivity(playerId)

    const playerRole = this.gameState.playerRoles.get(playerId);
    
    if (playerRole?.power !== POWERS.CITIZEN) {
      throw new Error(`Only citizens can cast suspicion votes during night phase`);
    }

    if (!this.gameState.alivePlayers.has(targetId)) {
      throw new Error('Invalid suspicion target');
    }

    if (targetId === playerId) {
      throw new Error('Cannot vote for yourself');
    }

    const currentSuspicionVotes = new Map(this.gameState.suspicionVotes);
    currentSuspicionVotes.set(playerId, targetId);
    
    this.updateGameState({
      suspicionVotes: currentSuspicionVotes
    });
    
    console.log(`${this.getPlayerName(playerId)} cast suspicion vote for ${this.getPlayerName(targetId)}`);
    
    this.checkNightCompletion();
  }

  checkMafiaVoteConsensus(votes) {
    const voteTargets = new Map();
    votes.forEach((targetId) => {
      voteTargets.set(targetId, (voteTargets.get(targetId) || 0) + 1);
    });

    const mafiaCount = this.getMafiaPlayers().length;
    const requiredVotes = Math.ceil(mafiaCount / 2);

    for (const [targetId, count] of voteTargets.entries()) {
      if (count >= requiredVotes) {
        return targetId;
      }
    }
    return null;
  }

  checkNightCompletion() {
    const mafiaPlayers = this.getMafiaPlayers();
    const doctorPlayers = this.gameState.players.filter(p => {
      const role = this.gameState.playerRoles.get(p.id);
      return role?.power === POWERS.HEAL && this.gameState.alivePlayers.has(p.id);
    });
    const seerPlayers = this.gameState.players.filter(p => {
      const role = this.gameState.playerRoles.get(p.id);
      return role?.power === POWERS.INVESTIGATE && this.gameState.alivePlayers.has(p.id);
    });
    const citizenPlayers = this.gameState.players.filter(p => {
      const role = this.gameState.playerRoles.get(p.id);
      return role?.power === POWERS.CITIZEN && this.gameState.alivePlayers.has(p.id);
    });

    const mafiaComplete = this.gameState.mafiaVotesLocked;
    const doctorComplete = doctorPlayers.length === 0 || this.gameState.healActions.size >= doctorPlayers.length;
    const seerComplete = seerPlayers.length === 0 || this.gameState.investigationActions.size >= seerPlayers.length;
    const citizenComplete = citizenPlayers.length === 0 || this.gameState.suspicionVotes.size >= citizenPlayers.length;

    console.log(`Night completion check - Mafia: ${mafiaComplete}, Doctor: ${doctorComplete}, Seer: ${seerComplete}, Citizens: ${citizenComplete} (${this.gameState.suspicionVotes.size}/${citizenPlayers.length})`);

    if (mafiaComplete && doctorComplete && seerComplete && citizenComplete) {
      console.log('All night actions complete, resolving night phase');
      this.resolveNightPhase();
    }
  }

  resolveNightPhase() {
    // Get consensus target
    const consensusTarget = this.checkMafiaVoteConsensus(this.gameState.mafiaVotes);
    let eliminatedPlayer = null;
    let savedPlayer = null;

    if (consensusTarget) {
      // Check if target was healed
      const wasHealed = Array.from(this.gameState.healActions.values()).includes(consensusTarget);
      
      if (wasHealed) {
        savedPlayer = this.gameState.players.find(p => p.id === consensusTarget);
        console.log(`${savedPlayer?.name} was saved by the doctor!`);
        
        // Update game state with saved player info
        this.updateGameState({
          savedPlayer: savedPlayer,
          eliminatedPlayer: null
        });
      } else {
        // Eliminate the target
        eliminatedPlayer = this.gameState.players.find(p => p.id === consensusTarget);
        const newAlivePlayers = new Set(this.gameState.alivePlayers);
        newAlivePlayers.delete(consensusTarget);
        
        this.updateGameState({
          alivePlayers: newAlivePlayers,
          eliminatedPlayer: eliminatedPlayer,
          savedPlayer: null
        });
        
        console.log(`${eliminatedPlayer?.name} was eliminated by the Mafia`);
        
        // Check win conditions
        if (this.checkWinConditions()) {
          return; // Game ended
        }
      }
    }

    // Calculate most suspicious player from citizen votes
    let mostSuspiciousPlayer = null;
    if (this.gameState.suspicionVotes.size > 0) {
      const suspicionCounts = new Map();
      
      // Count votes for each player
      for (const targetId of this.gameState.suspicionVotes.values()) {
        suspicionCounts.set(targetId, (suspicionCounts.get(targetId) || 0) + 1);
      }
      
      // Find player with most votes
      let maxVotes = 0;
      let topSuspects = [];
      
      for (const [playerId, voteCount] of suspicionCounts.entries()) {
        if (voteCount > maxVotes) {
          maxVotes = voteCount;
          topSuspects = [playerId];
        } else if (voteCount === maxVotes) {
          topSuspects.push(playerId);
        }
      }
      
      // Only show suspicion result if there's a clear winner (no ties)
      if (topSuspects.length === 1) {
        const suspectId = topSuspects[0];
        mostSuspiciousPlayer = this.gameState.players.find(p => p.id === suspectId);
        console.log(`Most suspicious player: ${mostSuspiciousPlayer?.name} with ${maxVotes} votes (clear winner)`);
      } else if (topSuspects.length > 1) {
        console.log(`Suspicion vote tied between ${topSuspects.length} players with ${maxVotes} votes each - not showing result`);
      }
    }

    // Wait for host confirmation before starting day phase
    this.updateGameState({
      gameState: GAME_STATES.NIGHT_RESOLVED,
      waitingForHostContinue: true,
      mostSuspiciousPlayer: mostSuspiciousPlayer
    });
    
    console.log('Night phase resolved - waiting for host to continue to day phase');
  }

  startDayPhase() {
    this.updateGameState({
      gameState: GAME_STATES.DAY_PHASE,
      accusations: new Map(),
      eliminationCountdown: null,
      dayEliminatedPlayer: null
    });
    
    console.log(`Day phase started in room ${this.roomId}`);
  }

  checkWinConditions() {
    const alivePlayers = this.getAlivePlayers();
    const aliveRoles = alivePlayers.map(player => this.gameState.playerRoles.get(player.id));
    
    const aliveMafia = aliveRoles.filter(role => role.alignment === 'evil').length;
    const aliveGood = aliveRoles.filter(role => role.alignment === 'good').length;
    
    let winner = null;
    let winCondition = null;
    
    if (aliveMafia >= aliveGood && aliveMafia > 0) {
      winner = 'mafia';
      winCondition = 'Mafia has achieved parity or superiority';
    } else if (aliveMafia === 0) {
      winner = 'villagers';
      winCondition = 'All mafia members have been eliminated';
    }
    
    if (winner) {
      this.updateGameState({
        gameState: GAME_STATES.ENDED,
        winner: winner,
        winCondition: winCondition
      });
      
      console.log(`Game ended: ${winner} wins - ${winCondition}`);
      return true;
    }
    
    return false;
  }

  checkInevitableVictory() {
    const alivePlayers = this.getAlivePlayers();
    const aliveRoles = alivePlayers.map(player => this.gameState.playerRoles.get(player.id));
    
    const aliveMafia = aliveRoles.filter(role => role.alignment === 'evil').length;
    const aliveGood = aliveRoles.filter(role => role.alignment === 'good').length;
    
    console.log(`🔍 Checking inevitable victory: ${aliveMafia} werewolves, ${aliveGood} villagers`);
    
    // If werewolves have parity or superiority entering night phase, they win immediately
    // During night phase, werewolves can kill and achieve/maintain parity
    if (aliveMafia >= aliveGood && aliveMafia > 0) {
      console.log(`🎯 INEVITABLE VICTORY: Werewolves have parity/superiority (${aliveMafia} vs ${aliveGood}) entering night phase`);
      this.updateGameState({
        gameState: GAME_STATES.ENDED,
        winner: 'mafia',
        winCondition: 'Werewolves achieved parity - victory is inevitable'
      });
      return true;
    }
    
    return false; // No inevitable victory, continue game
  }

  // Day Phase Voting Logic
  processDayVote(playerId, targetId) {
    // Update activity tracking
    this.updatePlayerActivity(playerId)

    console.log(`🗳️ Player ${playerId} voting for ${targetId || 'no target'}`);
    
    if (this.gameState.gameState !== GAME_STATES.DAY_PHASE) {
      console.log('❌ Day vote received but not in day phase');
      return;
    }
    
    // Don't allow dead players to vote
    if (!this.gameState.alivePlayers.has(playerId)) {
      console.log(`❌ Dead player ${playerId} attempted to vote`);
      return;
    }
    
    const newAccusations = new Map(this.gameState.accusations);
    
    // Remove player's previous accusation
    newAccusations.forEach((accusers, accusedId) => {
      if (accusers.has(playerId)) {
        accusers.delete(playerId);
        if (accusers.size === 0) {
          newAccusations.delete(accusedId);
        }
      }
    });
    
    // Add new accusation if target provided
    if (targetId && this.gameState.alivePlayers.has(targetId)) {
      if (!newAccusations.has(targetId)) {
        newAccusations.set(targetId, new Set());
      }
      newAccusations.get(targetId).add(playerId);
      
      const voterName = this.getPlayerName(playerId);
      const targetName = this.getPlayerName(targetId);
      console.log(`✅ ${voterName} accused ${targetName}`);
    }
    
    this.updateGameState({
      accusations: newAccusations
    });
    
    // Check for majority vote
    this.checkDayVoteConsensus();
  }
  
  checkDayVoteConsensus() {
    const alivePlayers = Array.from(this.gameState.alivePlayers);
    const majorityThreshold = Math.floor(alivePlayers.length / 2) + 1;
    
    console.log(`🔍 Checking consensus: ${alivePlayers.length} alive, need ${majorityThreshold} votes`);
    
    // Find if any player has majority votes
    for (const [accusedId, accusers] of this.gameState.accusations.entries()) {
      const voteCount = accusers.size;
      console.log(`📊 ${this.getPlayerName(accusedId)}: ${voteCount} votes`);
      
      if (voteCount >= majorityThreshold) {
        const targetName = this.getPlayerName(accusedId);
        console.log(`🎯 MAJORITY REACHED! ${targetName} has ${voteCount}/${majorityThreshold} votes`);
        this.startEliminationCountdown(accusedId);
        return;
      }
    }
    
    // No majority found - cancel existing countdown if any
    if (this.gameState.eliminationCountdown) {
      console.log(`❌ MAJORITY LOST! Cancelling elimination countdown`);
      if (this.eliminationTimer) {
        clearInterval(this.eliminationTimer);
        this.eliminationTimer = null;
      }
      this.updateGameState({
        eliminationCountdown: null
      });
    }
    
    console.log('⏳ No consensus yet, voting continues...');
  }
  
  startEliminationCountdown(targetId) {
    const targetName = this.getPlayerName(targetId);
    const countdownDuration = 5; // 5 seconds
    
    console.log(`⏰ Starting elimination countdown for ${targetName}`);
    
    this.updateGameState({
      eliminationCountdown: {
        targetId: targetId,
        targetName: targetName,
        timeLeft: countdownDuration
      }
    });
    
    // Start countdown timer
    this.eliminationTimer = setInterval(() => {
      if (this.gameState.eliminationCountdown && this.gameState.eliminationCountdown.timeLeft > 0) {
        const newTimeLeft = this.gameState.eliminationCountdown.timeLeft - 1;
        
        this.updateGameState({
          eliminationCountdown: {
            ...this.gameState.eliminationCountdown,
            timeLeft: newTimeLeft
          }
        });
        
        if (newTimeLeft === 0) {
          this.executeElimination(targetId);
        }
      }
    }, 1000);
  }
  
  executeElimination(targetId) {
    clearInterval(this.eliminationTimer);
    const targetName = this.getPlayerName(targetId);
    const targetRole = this.gameState.playerRoles.get(targetId);
    
    console.log(`💀 ELIMINATED: ${targetName} (${targetRole?.name})`);
    
    // Remove from alive players
    const newAlivePlayers = new Set(this.gameState.alivePlayers);
    newAlivePlayers.delete(targetId);
    
    // Mark player as dead
    const eliminatedPlayerInfo = {
      id: targetId,
      name: targetName,
      role: targetRole
    };
    
    this.updateGameState({
      alivePlayers: newAlivePlayers,
      dayEliminatedPlayer: eliminatedPlayerInfo,
      accusations: new Map(), // Clear accusations
      eliminationCountdown: null // Clear countdown
    });
    
    // Check win conditions
    if (this.checkWinConditions()) {
      return; // Game ended
    }
    
    // Wait for host confirmation before starting next night phase
    this.updateGameState({
      gameState: GAME_STATES.DAY_RESOLVED,
      waitingForHostContinue: true
    });
    
    console.log('Day phase resolved - waiting for host to continue to night phase');
  }
  
  getPlayerName(playerId) {
    return this.gameState.players.find(p => p.id === playerId)?.name || 'Unknown';
  }

  // Manual phase progression methods
  continueToNextPhase() {
    if (this.gameState.gameState === GAME_STATES.NIGHT_RESOLVED) {
      console.log('Host continuing from night resolved to day phase');
      this.updateGameState({
        waitingForHostContinue: false
      });
      this.startDayPhase();
    } else if (this.gameState.gameState === GAME_STATES.DAY_RESOLVED) {
      console.log('Host continuing from day resolved to night phase');
      this.updateGameState({
        waitingForHostContinue: false
      });
      this.startNightPhase();
    } else {
      console.log('Host tried to continue but not in a resolved state');
    }
  }

  // Get session URL for a player (for host to share)
  getPlayerSessionUrl(playerId) {
    const player = this.gameState.players.find(p => p.id === playerId)
    if (player && player.sessionToken) {
      const playerUrl = `${import.meta.env.VITE_PLAYER_URL || 'http://localhost:3001'}/room/${this.roomId}/player/${player.sessionToken}`
      return playerUrl
    }
    return null
  }
} 