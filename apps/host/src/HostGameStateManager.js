import { SOCKET_EVENTS, GameConnectionState, GAME_STATES, GAME_CONFIG, assignRoles, GAME_TYPES, ROLE_SETS } from '@werewolf-mafia/shared';

export class HostGameStateManager {
  constructor(socket, roomId) {
    this.socket = socket;
    this.roomId = roomId;
    this.gameState = {
      connectionState: GameConnectionState.ACTIVE,
      gameState: GAME_STATES.LOBBY,
      gameType: null,
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

    // Broadcast updated state to players via server
    this.broadcastGameState();
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
  }

  // Generate the single source of truth state
  getMasterGameState() {
    console.log('HOST DEBUG - getMasterGameState() gameType:', this.gameState.gameType);
    const masterState = {
      gameState: this.gameState.gameState,
      gameType: this.gameState.gameType,
      gamePaused: this.gameState.gamePaused,
      pauseReason: this.gameState.pauseReason,
      
      // Players with all info
      players: this.gameState.players.map(p => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        role: this.gameState.playerRoles.get(p.id),
        isReady: this.gameState.playerReadiness.get(p.id) || false,
        alive: this.gameState.alivePlayers.has(p.id),
        disconnectionInfo: p.disconnectionInfo || null
      })),
      
      // Phase-specific data
      eliminatedPlayer: this.gameState.eliminatedPlayer,
      savedPlayer: this.gameState.savedPlayer,
      dayEliminatedPlayer: this.gameState.dayEliminatedPlayer,
      accusations: Array.from(this.gameState.accusations.entries()),
      eliminationCountdown: this.gameState.eliminationCountdown,
      winner: this.gameState.winner,
      winCondition: this.gameState.winCondition,
      
      // Night phase actions
      mafiaVotes: Array.from(this.gameState.mafiaVotes.entries()),
      mafiaVotesLocked: this.gameState.mafiaVotesLocked || false,
      consensusTimer: this.gameState.consensusTimer || null,
      healActions: this.gameState.healActions ? Array.from(this.gameState.healActions.entries()) : [],
      investigationActions: this.gameState.investigationActions ? Array.from(this.gameState.investigationActions.entries()) : [],
      investigationResults: this.gameState.investigationResults ? Array.from(this.gameState.investigationResults.entries()) : []
    };

    // Add available targets for different roles
    if (this.gameState.gameState === GAME_STATES.NIGHT_PHASE) {
      masterState.availableTargets = {
        mafia: this.getAliveNonMafiaPlayers().map(p => ({ id: p.id, name: p.name })),
        doctor: this.gameState.players.filter(p => this.gameState.alivePlayers.has(p.id)).map(p => ({ id: p.id, name: p.name })),
        seer: this.gameState.players.filter(p => this.gameState.alivePlayers.has(p.id)).map(p => ({ id: p.id, name: p.name }))
      };
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

  addPlayer(playerId, playerName, profileImage) {
    // Check if player with same name already exists (for reconnection during active games)
    const existingPlayerIndex = this.gameState.players.findIndex(p => p.name === playerName);
    
    if (existingPlayerIndex !== -1 && this.gameState.gameState !== GAME_STATES.LOBBY) {
      // Player reconnecting during active game - update their socket ID
      const existingPlayer = this.gameState.players[existingPlayerIndex];
      const oldPlayerId = existingPlayer.id;
      const newPlayerId = playerId;
      
      console.log(`Player ${playerName} reconnecting: ${oldPlayerId} -> ${newPlayerId}`);
      
      // Update player's socket ID
      const updatedPlayers = [...this.gameState.players];
      updatedPlayers[existingPlayerIndex] = {
        ...existingPlayer,
        id: newPlayerId,
        connected: true,
        profileImage: profileImage
      };
      
      // Update all game state maps/sets to use new socket ID
      const newPlayerRoles = new Map(this.gameState.playerRoles);
      const newPlayerReadiness = new Map(this.gameState.playerReadiness);
      const newAlivePlayers = new Set(this.gameState.alivePlayers);
      const newMafiaVotes = new Map(this.gameState.mafiaVotes);
      const newAccusations = new Map(this.gameState.accusations);
      const newHealActions = new Map(this.gameState.healActions);
      const newInvestigationActions = new Map(this.gameState.investigationActions);
      const newInvestigationResults = new Map(this.gameState.investigationResults);
      
      // Move data from old socket ID to new socket ID
      if (newPlayerRoles.has(oldPlayerId)) {
        newPlayerRoles.set(newPlayerId, newPlayerRoles.get(oldPlayerId));
        newPlayerRoles.delete(oldPlayerId);
      }
      if (newPlayerReadiness.has(oldPlayerId)) {
        newPlayerReadiness.set(newPlayerId, newPlayerReadiness.get(oldPlayerId));
        newPlayerReadiness.delete(oldPlayerId);
      }
      if (newAlivePlayers.has(oldPlayerId)) {
        newAlivePlayers.delete(oldPlayerId);
        newAlivePlayers.add(newPlayerId);
      }
      if (newMafiaVotes.has(oldPlayerId)) {
        newMafiaVotes.set(newPlayerId, newMafiaVotes.get(oldPlayerId));
        newMafiaVotes.delete(oldPlayerId);
      }
      if (newHealActions.has(oldPlayerId)) {
        newHealActions.set(newPlayerId, newHealActions.get(oldPlayerId));
        newHealActions.delete(oldPlayerId);
      }
      if (newInvestigationActions.has(oldPlayerId)) {
        newInvestigationActions.set(newPlayerId, newInvestigationActions.get(oldPlayerId));
        newInvestigationActions.delete(oldPlayerId);
      }
      if (newInvestigationResults.has(oldPlayerId)) {
        newInvestigationResults.set(newPlayerId, newInvestigationResults.get(oldPlayerId));
        newInvestigationResults.delete(oldPlayerId);
      }
      
      // Update accusations (both as accuser and accused)
      newAccusations.forEach((accusers, accusedId) => {
        if (accusers.has(oldPlayerId)) {
          accusers.delete(oldPlayerId);
          accusers.add(newPlayerId);
        }
      });
      if (newAccusations.has(oldPlayerId)) {
        newAccusations.set(newPlayerId, newAccusations.get(oldPlayerId));
        newAccusations.delete(oldPlayerId);
      }
      
      this.updateGameState({
        players: updatedPlayers,
        playerRoles: newPlayerRoles,
        playerReadiness: newPlayerReadiness,
        alivePlayers: newAlivePlayers,
        mafiaVotes: newMafiaVotes,
        accusations: newAccusations,
        healActions: newHealActions,
        investigationActions: newInvestigationActions,
        investigationResults: newInvestigationResults
      });
      
      console.log(`✅ Reconnection successful for ${playerName}: alive=${newAlivePlayers.has(newPlayerId)}`);
    } else {
      // New player joining or player joining lobby - create new player
      const newPlayer = {
        id: playerId,
        name: playerName,
        connected: true,
        profileImage: profileImage
      };

      this.updateGameState({
        players: [...this.gameState.players, newPlayer]
      });
      
      console.log(`✅ New player added: ${playerName}`);
    }
  }

  removePlayer(playerId) {
    const updatedPlayers = this.gameState.players.filter(p => p.id !== playerId);
    
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
  }

  startGame() {
    if (this.gameState.players.length < GAME_CONFIG.MIN_PLAYERS) {
      throw new Error(`Need at least ${GAME_CONFIG.MIN_PLAYERS} players to start`);
    }

    if (this.gameState.gameState !== GAME_STATES.LOBBY) {
      throw new Error('Game already started');
    }

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

  playerReady(playerId) {
    const newReadiness = new Map(this.gameState.playerReadiness);
    newReadiness.set(playerId, true);
    
    this.updateGameState({
      playerReadiness: newReadiness
    });
    
    console.log(`Player ${playerId} is ready in room ${this.roomId}`);
    
    // Check if all players are ready
    const allReady = this.gameState.players.every(player => {
      return newReadiness.get(player.id) === true;
    });
    
    if (allReady) {
      console.log(`All players ready in room ${this.roomId}, starting night phase`);
      this.startNightPhase();
    }
  }

  startNightPhase() {
    this.updateGameState({
      gameState: GAME_STATES.NIGHT_PHASE,
      mafiaVotes: new Map(),
      healActions: new Map(),
      investigationActions: new Map(),
      mafiaVotesLocked: false,
      eliminatedPlayer: null,
      savedPlayer: null
    });
    
    console.log(`Night phase started in room ${this.roomId}`);
  }

  // Handle player actions
  processMafiaVote(playerId, targetId) {
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
      
      // Start consensus timer
      setTimeout(() => {
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
    const gameType = this.gameState.gameType || GAME_TYPES.WEREWOLF;
    const roleSet = ROLE_SETS[gameType];
    const playerRole = this.gameState.playerRoles.get(playerId);
    
    if (playerRole?.name !== roleSet.PROTECTOR.name) {
      throw new Error(`Only ${roleSet.PROTECTOR.name} can heal during night phase`);
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
    const gameType = this.gameState.gameType || GAME_TYPES.WEREWOLF;
    const roleSet = ROLE_SETS[gameType];
    const playerRole = this.gameState.playerRoles.get(playerId);
    
    if (playerRole?.name !== roleSet.INVESTIGATOR.name) {
      throw new Error(`Only ${roleSet.INVESTIGATOR.name} can investigate during night phase`);
    }

    if (!this.gameState.alivePlayers.has(targetId)) {
      throw new Error('Invalid investigation target');
    }

    const targetPlayer = this.gameState.players.find(p => p.id === targetId);
    const targetRole = this.gameState.playerRoles.get(targetId);
    
    let resultMessage;
    if (targetRole?.alignment === 'evil') {
      resultMessage = `${targetPlayer?.name} appears to be aligned with evil.`;
    } else {
      resultMessage = `${targetPlayer?.name} appears innocent... for now.`;
    }
    
    const currentResults = new Map(this.gameState.investigationResults);
    currentResults.set(playerId, resultMessage);
    
    const currentInvestigationActions = new Map(this.gameState.investigationActions);
    currentInvestigationActions.set(playerId, targetId);
    
    this.updateGameState({
      investigationActions: currentInvestigationActions,
      investigationResults: currentResults,
      seerInvestigatedPlayerId: targetId
    });
    
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
      const gameType = this.gameState.gameType || GAME_TYPES.WEREWOLF;
      const roleSet = ROLE_SETS[gameType];
      return role?.name === roleSet.PROTECTOR.name && this.gameState.alivePlayers.has(p.id);
    });
    const seerPlayers = this.gameState.players.filter(p => {
      const role = this.gameState.playerRoles.get(p.id);
      const gameType = this.gameState.gameType || GAME_TYPES.WEREWOLF;
      const roleSet = ROLE_SETS[gameType];
      return role?.name === roleSet.INVESTIGATOR.name && this.gameState.alivePlayers.has(p.id);
    });

    const mafiaComplete = this.gameState.mafiaVotesLocked;
    const doctorComplete = doctorPlayers.length === 0 || this.gameState.healActions.size >= doctorPlayers.length;
    const seerComplete = seerPlayers.length === 0 || this.gameState.investigationActions.size >= seerPlayers.length;

    if (mafiaComplete && doctorComplete && seerComplete) {
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
      } else {
        // Eliminate the target
        eliminatedPlayer = this.gameState.players.find(p => p.id === consensusTarget);
        const newAlivePlayers = new Set(this.gameState.alivePlayers);
        newAlivePlayers.delete(consensusTarget);
        
        this.updateGameState({
          alivePlayers: newAlivePlayers,
          eliminatedPlayer: eliminatedPlayer,
          savedPlayer: savedPlayer
        });
        
        console.log(`${eliminatedPlayer?.name} was eliminated by the Mafia`);
        
        // Check win conditions
        if (this.checkWinConditions()) {
          return; // Game ended
        }
      }
    }

    // Start day phase after a delay
    setTimeout(() => {
      this.startDayPhase();
    }, 3000);
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
} 