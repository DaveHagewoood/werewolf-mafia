import { SOCKET_EVENTS, GAME_STATES, GAME_CONFIG, assignRoles, GAME_TYPES, ROLE_SETS, POWERS } from '@werewolf-mafia/shared';
import { storyGenerationService } from './services/StoryGenerationService.js';

export class HostGameStateManager {
  constructor(socket, roomId, onStateChange = null, onStoryDisplay = null) {
    this.socket = socket;
    this.roomId = roomId;
    this.onStateChange = onStateChange;
    this.onStoryDisplay = onStoryDisplay;
    
    // Story generation tracking
    this.originalIntroStory = null;
    this.eliminationHistory = [];
    
    // Initialize timer handles for countdown management
    this.consensusTimerHandle = null;
    this.consensusCountdownInterval = null;
    this.eliminationTimer = null;
    
    // Track logged state to avoid spam
    this.lastLoggedStoryState = null;
    this.lastLoggedMasterState = null;
    
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
      // Note: introStory removed from persistent game state - now handled as temporary display
    };
    
    console.log(`HostGameStateManager: Initialized for room ${roomId}`);
  }

  updateGameState(updates) {
    // Only log story-related updates or major state changes
    if (updates.introStory !== undefined || updates.gameState || Object.keys(updates).length > 1) {
      console.log(`HostGameStateManager: Updating state:`, Object.keys(updates));
    }

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

    // Only log player updates for major changes, not activity pings
    if (updates.players && Object.keys(updates).length > 1) {
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
    // Only log for story intro state changes (not every broadcast)
    if (this.gameState.gameState === GAME_STATES.STORY_INTRO && this.lastLoggedStoryState !== this.gameState.introStory) {
      console.log(`HostGameStateManager: Broadcasting state, gameState: ${this.gameState.gameState}, introStory: ${this.gameState.introStory ? 'present' : 'null'}`);
      this.lastLoggedStoryState = this.gameState.introStory;
    }

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
    // Only log once per story state change
    if (this.gameState.gameState === GAME_STATES.STORY_INTRO && this.lastLoggedMasterState !== this.gameState.introStory) {
      console.log('HOST DEBUG - getMasterGameState() gameType:', this.gameState.gameType, 'introStory:', this.gameState.introStory ? 'present' : 'null');
      this.lastLoggedMasterState = this.gameState.introStory;
    }
    
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
      suspicionVotes: this.gameState.suspicionVotes ? Array.from(this.gameState.suspicionVotes.entries()) : [],
      nightActionsComplete: this.gameState.nightActionsComplete || false,
      
      // Death narratives
      nightDeathNarrative: this.gameState.nightDeathNarrative || null,
      dayDeathNarrative: this.gameState.dayDeathNarrative || null,
      
      // End game story
      endGameStory: this.gameState.endGameStory || null
    };

    // Debug log death narratives when they're present
    if (this.gameState.nightDeathNarrative) {
      console.log('📤 Host: Sending nightDeathNarrative to React (', this.gameState.nightDeathNarrative.length, 'chars)');
    }
    if (this.gameState.dayDeathNarrative) {
      console.log('📤 Host: Sending dayDeathNarrative to React (', this.gameState.dayDeathNarrative.length, 'chars)');
    }

    // Removed repeated logging - story state is now logged only when it changes

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

  addPlayer(playerId, playerName, profileImage, sessionToken = null, gender = null, job = null) {
    // Create new player entry
    const newPlayer = {
      id: playerId,
      name: playerName,
      gender: gender,
      job: job,
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
      console.log(`All connected players ready in room ${this.roomId}, starting story intro`);
      this.startStoryIntro();
    }
  }

  async startStoryIntro() {
    console.log(`🎭 Host: Generating intro story for ${this.gameState.gameType} theme`);
    
    // Set story intro state immediately
    this.updateGameState({
      gameState: GAME_STATES.STORY_INTRO
    });

    try {
      // Generate story locally using host-side service
      const playerDetails = this.gameState.players.map(p => ({
        name: p.name,
        gender: p.gender || 'Unknown',
        job: p.job || 'Villager'
      }));

      console.log(`🎯 Host: Generating story locally...`);
      const story = await storyGenerationService.generateIntroStory(
        this.gameState.gameType,
        this.gameState.players.length,
        this.gameState.players.map(p => p.name),
        playerDetails
      );

      console.log(`✅ Host: Story generated successfully (${story.length} chars)`);
      
      // Store the original story for death narrative continuity
      this.originalIntroStory = story;
      
      // Display story to host and players (temporary, not in game state)
      this.displayStoryTemporarily(story);
      
    } catch (error) {
      console.error('❌ Host: Story generation failed:', error.message);
      
      // Use fallback story
      const fallbackStory = storyGenerationService.getFallbackStory(
        this.gameState.gameType,
        this.gameState.players.length
      );
      
      console.log(`🔄 Host: Using fallback story (${fallbackStory.length} chars)`);
              this.displayStoryTemporarily(fallbackStory);
    }
  }

  displayStoryTemporarily(story) {
    console.log(`📖 Host: Displaying intro story temporarily to host and players`);
    
    // Trigger temporary story display in host UI (not via game state)
    if (this.onStoryDisplay) {
      this.onStoryDisplay(story, 'INTRO_STORY');
    }
    
    // Send story directly to all players via server relay
    this.socket.emit('broadcast-to-players', {
      roomId: this.roomId,
      event: 'story-intro-update',
      data: { story: story }
    });
    
    // Set host continue mode after story is displayed
    this.updateGameState({
      waitingForHostContinue: true
    });
    
    console.log(`📖 Host: Intro story sent to players, waiting for host to continue`);
  }

  // Note: setIntroStory method removed - story generation now handled locally in startStoryIntro()

  async startNightPhase() {
    // Check for inevitable victory before starting night phase
    if (await this.checkInevitableVictory()) {
      return; // Game ended due to inevitable victory
    }
    
    // Clear any existing timers from previous phases
    if (this.consensusTimerHandle) {
      clearTimeout(this.consensusTimerHandle);
      this.consensusTimerHandle = null;
    }
    if (this.consensusCountdownInterval) {
      clearInterval(this.consensusCountdownInterval);
      this.consensusCountdownInterval = null;
    }
    
    this.updateGameState({
      gameState: GAME_STATES.NIGHT_PHASE,
      mafiaVotes: new Map(),
      healActions: new Map(),
      investigationActions: new Map(),
      investigationResults: new Map(),
      suspicionVotes: new Map(),
      mafiaVotesLocked: false,
      eliminatedPlayer: null,
      savedPlayer: null,
      mostSuspiciousPlayer: null,
      nightDeathNarrative: null, // Clear previous death narrative
      dayDeathNarrative: null
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
    }
    if (this.consensusCountdownInterval) {
      clearInterval(this.consensusCountdownInterval);
      this.consensusCountdownInterval = null;
    }
    updates.consensusTimer = null;

    // Check for consensus
    const consensusTarget = this.checkMafiaVoteConsensus(newMafiaVotes);
    if (consensusTarget) {
      const targetPlayer = this.gameState.players.find(p => p.id === consensusTarget);
      console.log(`Mafia consensus reached for ${targetPlayer?.name}`);
      
      const initialTimeLeft = Math.floor(GAME_CONFIG.MAFIA_VOTE_CONSENSUS_TIME / 1000);
      let currentTimeLeft = initialTimeLeft;
      
      updates.consensusTimer = {
        targetId: consensusTarget,
        targetName: targetPlayer?.name,
        timeLeft: currentTimeLeft
      };
      
      // Start countdown interval that updates the timer every second
      this.consensusCountdownInterval = setInterval(() => {
        currentTimeLeft--;
        
        if (currentTimeLeft > 0) {
          // Update the timer display for players
          this.updateGameState({
            consensusTimer: {
              targetId: consensusTarget,
              targetName: targetPlayer?.name,
              timeLeft: currentTimeLeft
            }
          });
        } else {
          // Timer expired, lock in the votes
          clearInterval(this.consensusCountdownInterval);
          this.consensusCountdownInterval = null;
          this.updateGameState({
            mafiaVotesLocked: true,
            consensusTimer: null
          });
          this.checkNightCompletion();
        }
      }, 1000);
      
      // Fallback timeout in case interval fails
      this.consensusTimerHandle = setTimeout(() => {
        this.consensusTimerHandle = null;
        if (this.consensusCountdownInterval) {
          clearInterval(this.consensusCountdownInterval);
          this.consensusCountdownInterval = null;
        }
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
      console.log('All night actions complete, showing results on current screens for 5 seconds');
      this.processNightResults();
    }
  }

  processNightResults() {
    // First, perform night resolution calculations
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
          alivePlayers: newAlivePlayers
        });
        
        console.log(`${eliminatedPlayer?.name} was eliminated by the Mafia`);
        
        // Add to elimination history for story continuity
        this.eliminationHistory.push({
          player: {
            name: eliminatedPlayer.name,
            gender: eliminatedPlayer.gender || 'Unknown',
            job: eliminatedPlayer.job || 'Villager'
          },
          type: 'NIGHT_KILL',
          phase: `Night ${Math.floor(this.eliminationHistory.filter(e => e.type === 'NIGHT_KILL').length / 2) + 1}`
        });
        
        // Always generate death narrative for night resolved screen (async)
        this.generateNightDeathNarrativeForResolution(eliminatedPlayer);
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

    // Update results while staying in NIGHT_PHASE
    this.updateGameState({
      nightActionsComplete: true,
      eliminatedPlayer: eliminatedPlayer,
      savedPlayer: savedPlayer,
      mostSuspiciousPlayer: mostSuspiciousPlayer
    });

    // Set 5-second timer to automatically proceed to NIGHT_RESOLVED
    this.nightActionsCompleteTimer = setTimeout(() => {
      this.nightActionsCompleteTimer = null;
      this.finishNightResolution();
    }, 5000);
    
    console.log('Night actions complete - showing results on voting screens for 5 seconds before resolution');
  }

  async finishNightResolution() {
    // Check win conditions (elimination/save already applied)
    if (this.gameState.eliminatedPlayer && await this.checkWinConditions()) {
      return; // Game ended
    }

    // Wait for host confirmation before starting day phase
    this.updateGameState({
      gameState: GAME_STATES.NIGHT_RESOLVED,
      waitingForHostContinue: true
    });
    
    console.log('Night phase resolved - waiting for host to continue to day phase');
  }

  // Legacy method - kept for any remaining references
  resolveNightPhase() {
    console.log('Legacy resolveNightPhase called - redirecting to new flow');
    this.startNightActionsCompletePhase();
  }

  startDayPhase() {
    this.updateGameState({
      gameState: GAME_STATES.DAY_PHASE,
      accusations: new Map(),
      eliminationCountdown: null,
      dayEliminatedPlayer: null,
      nightDeathNarrative: null, // Clear previous death narrative
      dayDeathNarrative: null
    });
    
    console.log(`Day phase started in room ${this.roomId}`);
  }

  async checkWinConditions() {
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
      console.log(`Game ended: ${winner} wins - ${winCondition}`);
      
      // Generate end game story
      await this.generateEndGameStory(winner, winCondition, alivePlayers);
      
      return true;
    }
    
    return false;
  }

  async checkInevitableVictory() {
    const alivePlayers = this.getAlivePlayers();
    const aliveRoles = alivePlayers.map(player => this.gameState.playerRoles.get(player.id));
    
    const aliveMafia = aliveRoles.filter(role => role.alignment === 'evil').length;
    const aliveGood = aliveRoles.filter(role => role.alignment === 'good').length;
    
    console.log(`🔍 Checking inevitable victory: ${aliveMafia} werewolves, ${aliveGood} villagers`);
    
    // If werewolves have parity or superiority entering night phase, they win immediately
    // During night phase, werewolves can kill and achieve/maintain parity
    if (aliveMafia >= aliveGood && aliveMafia > 0) {
      console.log(`🎯 INEVITABLE VICTORY: Werewolves have parity/superiority (${aliveMafia} vs ${aliveGood}) entering night phase`);
      
      const winCondition = 'Werewolves achieved parity - victory is inevitable';
      
      // Generate end game story
      await this.generateEndGameStory('mafia', winCondition, alivePlayers);
      
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
  
  async executeElimination(targetId) {
    clearInterval(this.eliminationTimer);
    const targetName = this.getPlayerName(targetId);
    const targetRole = this.gameState.playerRoles.get(targetId);
    const eliminatedPlayer = this.gameState.players.find(p => p.id === targetId);
    
    console.log(`💀 ELIMINATED: ${targetName} (${targetRole?.name})`);
    
    // Add to elimination history for story continuity
    this.eliminationHistory.push({
      player: {
        name: eliminatedPlayer.name,
        gender: eliminatedPlayer.gender || 'Unknown',
        job: eliminatedPlayer.job || 'Villager'
      },
      type: 'DAY_VOTE',
      phase: `Day ${Math.floor(this.eliminationHistory.filter(e => e.type === 'DAY_VOTE').length) + 1}`
    });
    
    // Remove from alive players
    const newAlivePlayers = new Set(this.gameState.alivePlayers);
    newAlivePlayers.delete(targetId);
    
    // Mark player as dead
    const eliminatedPlayerInfo = {
      id: targetId,
      name: targetName,
      role: targetRole
    };
    
    // Generate death narrative if we have original story
    let deathNarrative = null;
    if (this.originalIntroStory) {
      try {
        const remainingPlayers = this.gameState.players
          .filter(p => newAlivePlayers.has(p.id))
          .map(p => ({
            name: p.name,
            gender: p.gender || 'Unknown',
            job: p.job || 'Villager'
          }));

        deathNarrative = await storyGenerationService.generateDeathNarrative({
          eliminatedPlayer: {
            name: eliminatedPlayer.name,
            gender: eliminatedPlayer.gender || 'Unknown',
            job: eliminatedPlayer.job || 'Villager'
          },
          type: 'DAY_VOTE',
          gameTheme: this.gameState.gameType,
          originalStory: this.originalIntroStory,
          eliminationHistory: this.eliminationHistory.slice(0, -1), // Exclude current elimination
          remainingPlayers: remainingPlayers
        });
        
        console.log(`💀 Generated day death narrative: ${deathNarrative}`);
      } catch (error) {
        console.error('❌ Failed to generate day death narrative:', error);
      }
    }
    
    this.updateGameState({
      alivePlayers: newAlivePlayers,
      dayEliminatedPlayer: eliminatedPlayerInfo,
      accusations: new Map(), // Clear accusations
      eliminationCountdown: null // Clear countdown
    });
    
    // Store death narrative in game state for day resolved screen
    if (deathNarrative) {
      this.updateGameState({
        dayDeathNarrative: deathNarrative
      });
    }
    
    // Check win conditions
    if (await this.checkWinConditions()) {
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
  async continueToNextPhase() {
    if (this.gameState.gameState === GAME_STATES.STORY_INTRO) {
      console.log('Host continuing from story intro to night phase');
      this.updateGameState({
        waitingForHostContinue: false
      });
      await this.startNightPhase();
    } else if (this.gameState.gameState === GAME_STATES.NIGHT_RESOLVED) {
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
      await this.startNightPhase();
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

  async generateNightDeathNarrativeForResolution(eliminatedPlayer) {
    try {
      console.log(`💀 Starting death narrative generation for ${eliminatedPlayer.name}`);
      
      const remainingPlayers = this.gameState.players
        .filter(p => this.gameState.alivePlayers.has(p.id))
        .map(p => ({
          name: p.name,
          gender: p.gender || 'Unknown',
          job: p.job || 'Villager'
        }));

      const deathNarrative = await storyGenerationService.generateDeathNarrative({
        eliminatedPlayer: {
          name: eliminatedPlayer.name,
          gender: eliminatedPlayer.gender || 'Unknown',
          job: eliminatedPlayer.job || 'Villager'
        },
        type: 'NIGHT_KILL',
        gameTheme: this.gameState.gameType,
        originalStory: this.originalIntroStory,
        eliminationHistory: this.eliminationHistory.slice(0, -1), // Exclude current elimination
        remainingPlayers: remainingPlayers
      });
      
      console.log(`💀 Generated night death narrative for resolution: ${deathNarrative}`);
      console.log(`💀 About to update game state with nightDeathNarrative`);
      
      // Store death narrative in game state for night resolved screen
      if (deathNarrative) {
        this.updateGameState({
          nightDeathNarrative: deathNarrative
        });
        console.log(`💀 Game state updated with death narrative`);
      } else {
        console.log(`💀 No death narrative generated, setting fallback`);
        this.updateGameState({
          nightDeathNarrative: `${eliminatedPlayer.name} was eliminated by the ${this.gameState.gameType === 'mafia' ? 'Mafia' : 'Werewolves'} during the night.`
        });
      }
    } catch (error) {
      console.error('❌ Failed to generate night death narrative:', error);
      // Set fallback narrative on error
      this.updateGameState({
        nightDeathNarrative: `${eliminatedPlayer.name} was eliminated by the ${this.gameState.gameType === 'mafia' ? 'Mafia' : 'Werewolves'} during the night.`
      });
    }
  }

  async generateEndGameStory(winner, winCondition, alivePlayers) {
    try {
      console.log(`🏁 Starting end game story generation for ${winner} victory`);
      
      // Prepare survivor data
      const survivors = alivePlayers.map(player => ({
        name: player.name,
        gender: player.gender || 'Unknown',
        job: player.job || 'Villager',
        role: this.gameState.playerRoles.get(player.id)
      }));

      const endGameData = {
        winner: winner,
        gameTheme: this.gameState.gameType,
        winCondition: winCondition,
        originalStory: this.originalIntroStory,
        eliminationHistory: this.eliminationHistory,
        survivors: survivors,
        totalPlayers: this.gameState.players.length
      };

      // Generate the end game story
      const endGameStory = await storyGenerationService.generateEndGameStory(endGameData);
      
      console.log(`🏁 Generated end game story (${endGameStory.length} chars):`, endGameStory);
      
      // Update game state with end result and story
      this.updateGameState({
        gameState: GAME_STATES.ENDED,
        winner: winner,
        winCondition: winCondition,
        endGameStory: endGameStory
      });
      
      console.log(`✅ End game story set in game state`);
      
    } catch (error) {
      console.error('❌ Failed to generate end game story:', error);
      
      // Fallback: Update game state without story
      this.updateGameState({
        gameState: GAME_STATES.ENDED,
        winner: winner,
        winCondition: winCondition,
        endGameStory: null
      });
      
      console.log(`⚠️ Game ended without end game story due to generation error`);
    }
  }
} 