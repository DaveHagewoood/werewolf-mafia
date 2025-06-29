import { SOCKET_EVENTS, GameConnectionState, getPlayerGameState, GAME_STATES, GAME_CONFIG, POWERS } from '@werewolf-mafia/shared';

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
      investigationActions: new Map(),
      phaseStartTime: Date.now()
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

    // Generate the MASTER state (what host sees)
    const masterState = this.getMasterGameState(state);
    
    // Send SAME state to host
    if (state.host) {
      this.io.to(state.host).emit('game-state-update', masterState);
    }
    
    // Send SAME state to each player (they'll filter it client-side for their role)
    state.players.forEach(player => {
      this.io.to(player.id).emit('game-state-update', masterState);
    });
  }

  // Generate the single source of truth state
  getMasterGameState(room) {
    const masterState = {
      gameState: room.gameState,
      gameType: room.gameType,
      
      // Players with all info
      players: room.players.map(p => {
        const role = room.playerRoles.get(p.id);
        const isAlive = room.alivePlayers.has(p.id);
        const hasHealed = room.healActions && room.healActions.has(p.id);
        const hasInvestigated = room.investigationActions && room.investigationActions.has(p.id);
        const hasVoted = room.mafiaVotes && room.mafiaVotes.has(p.id);
        
        // Calculate actionStatus based on game phase and role
        let actionStatus = 'WAITING_FOR_ACTION';
        let hasActed = false;
        
        if (!isAlive) {
          actionStatus = 'ELIMINATED';
        } else if (room.gameState === GAME_STATES.NIGHT_PHASE && role) {
          if (role.alignment === 'evil' && hasVoted) {
            actionStatus = 'COMPLETED';
            hasActed = true;
          } else if (role.power === POWERS.HEAL && hasHealed) {
            actionStatus = 'COMPLETED'; 
            hasActed = true;
          } else if (role.power === POWERS.INVESTIGATE && hasInvestigated) {
            actionStatus = 'COMPLETED';
            hasActed = true;
          }
        }
        
        // Role-specific capability flags
        const canVote = isAlive && room.gameState === GAME_STATES.DAY_PHASE;
        const canHeal = isAlive && room.gameState === GAME_STATES.NIGHT_PHASE && 
                       role && role.power === POWERS.HEAL && !hasHealed;
        const canInvestigate = isAlive && room.gameState === GAME_STATES.NIGHT_PHASE && 
                             role && role.power === POWERS.INVESTIGATE && !hasInvestigated;
        const canMafiaVote = isAlive && room.gameState === GAME_STATES.NIGHT_PHASE && 
                           role && role.alignment === 'evil' && !hasVoted;
        
        return {
          id: p.id,
          name: p.name,
          sessionToken: p.sessionToken,
          role: role,
          isReady: room.playerReadiness.get(p.id) || false,
          alive: isAlive,
          
          // Enhanced action status information
          actionStatus: actionStatus,
          hasActed: hasActed,
          
          // Role-specific capability flags
          canVote: canVote,
          canHeal: canHeal,
          canInvestigate: canInvestigate,
          canMafiaVote: canMafiaVote,
          
          // Individual action status
          isHealed: room.healActions && Array.from(room.healActions.values()).includes(p.id),
          investigationResult: room.investigationResults && room.investigationResults.get(p.id) || null
        };
      }),
      
      // Phase-specific data
      eliminatedPlayer: room.eliminatedPlayer,
      savedPlayer: room.savedPlayer,
      dayEliminatedPlayer: room.dayEliminatedPlayer,
      accusations: this.formatAccusationsForClients(room),
      eliminationCountdown: room.eliminationCountdown,
      winner: room.winner,
      winCondition: room.winCondition,
      
      // Night phase actions
      mafiaVotes: Array.from(room.mafiaVotes.entries()),
      mafiaVotesLocked: room.mafiaVotesLocked || false,
      consensusTimer: room.consensusTimer || null,
      healActions: room.healActions ? Array.from(room.healActions.entries()) : [],
      investigationActions: room.investigationActions ? Array.from(room.investigationActions.entries()) : [],
      investigationResults: room.investigationResults ? Array.from(room.investigationResults.entries()) : []
    };

    // Add comprehensive derived action information
    masterState.derivedActions = this.calculateDerivedActions(room);
    
    // Add timing information
    masterState.timeRemaining = this.calculateTimeRemaining(room);
    
    // Legacy: Keep existing availableTargets for backward compatibility
    if (room.gameState === GAME_STATES.NIGHT_PHASE) {
      masterState.availableTargets = {
        mafia: this.getAliveNonMafiaPlayers(room).map(p => ({ id: p.id, name: p.name })),
        doctor: room.players.filter(p => room.alivePlayers.has(p.id)).map(p => ({ id: p.id, name: p.name })),
        seer: room.players.filter(p => room.alivePlayers.has(p.id)).map(p => ({ id: p.id, name: p.name }))
      };
    }

    return masterState;
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

  // Calculate comprehensive derived action information
  calculateDerivedActions(room) {
    const derivedActions = {};
    
    room.players.forEach(player => {
      const role = room.playerRoles.get(player.id);
      const isAlive = room.alivePlayers.has(player.id);
      
      const playerActions = {
        availableActions: [],
        actionTargets: [],
        primaryAction: null,
        actionContext: {}
      };
      
      if (!isAlive) {
        playerActions.availableActions = [];
        playerActions.actionTargets = [];
        playerActions.primaryAction = null;
      } else {
        // Calculate based on game phase and role
        switch (room.gameState) {
          case GAME_STATES.NIGHT_PHASE:
            if (role && role.alignment === 'evil') {
              const hasVoted = room.mafiaVotes && room.mafiaVotes.has(player.id);
              if (!hasVoted) {
                playerActions.availableActions.push('mafia_vote');
                playerActions.actionTargets = this.getAliveNonMafiaPlayers(room)
                  .map(p => ({ id: p.id, name: p.name, action: 'mafia_vote' }));
                playerActions.primaryAction = 'mafia_vote';
                playerActions.actionContext.description = 'Vote to eliminate a player';
              }
            } else if (role && role.power === POWERS.HEAL) {
              const hasHealed = room.healActions && room.healActions.has(player.id);
              if (!hasHealed) {
                playerActions.availableActions.push('heal');
                playerActions.actionTargets = room.players
                  .filter(p => room.alivePlayers.has(p.id))
                  .map(p => ({ id: p.id, name: p.name, action: 'heal' }));
                playerActions.primaryAction = 'heal';
                playerActions.actionContext.description = 'Protect a player from elimination';
              }
            } else if (role && role.power === POWERS.INVESTIGATE) {
              const hasInvestigated = room.investigationActions && room.investigationActions.has(player.id);
              if (!hasInvestigated) {
                playerActions.availableActions.push('investigate');
                playerActions.actionTargets = room.players
                  .filter(p => room.alivePlayers.has(p.id) && p.id !== player.id)
                  .map(p => ({ id: p.id, name: p.name, action: 'investigate' }));
                playerActions.primaryAction = 'investigate';
                playerActions.actionContext.description = 'Learn a player\'s alignment';
              }
            }
            break;
            
          case GAME_STATES.DAY_PHASE:
            playerActions.availableActions.push('discuss');
            playerActions.actionTargets = room.players
              .filter(p => room.alivePlayers.has(p.id) && p.id !== player.id)
              .map(p => ({ id: p.id, name: p.name, action: 'accuse' }));
            playerActions.primaryAction = 'discuss';
            playerActions.actionContext.description = 'Discuss and identify suspicious players';
            break;
            
          case GAME_STATES.ROLE_ASSIGNMENT:
            if (!room.playerReadiness.get(player.id)) {
              playerActions.availableActions.push('confirm_role');
              playerActions.primaryAction = 'confirm_role';
              playerActions.actionContext.description = 'Confirm your role to continue';
            }
            break;
        }
      }
      
      derivedActions[player.id] = playerActions;
    });
    
    return derivedActions;
  }

  // Calculate time remaining in current phase
  calculateTimeRemaining(room) {
    const phaseTimeouts = {
      [GAME_STATES.ROLE_ASSIGNMENT]: 60000,
      [GAME_STATES.NIGHT_PHASE]: 90000,
      [GAME_STATES.DAY_PHASE]: 180000,
    };
    
    const phaseTimeout = phaseTimeouts[room.gameState] || 0;
    
    if (room.phaseStartTime) {
      const elapsed = Date.now() - room.phaseStartTime;
      const remaining = Math.max(0, phaseTimeout - elapsed);
      return remaining;
    }
    
    return phaseTimeout;
  }

  // Format accusations for client compatibility
  formatAccusationsForClients(room) {
    const accusationData = {};
    
    room.accusations.forEach((accusers, accusedId) => {
      const accusedPlayer = room.players.find(p => p.id === accusedId);
      const accuserNames = Array.from(accusers).map(accuserId => {
        const accuserPlayer = room.players.find(p => p.id === accuserId);
        return accuserPlayer?.name || 'Unknown';
      });
      
      accusationData[accusedId] = {
        name: accusedPlayer?.name || 'Unknown',
        accusers: accuserNames,
        voteCount: accusers.size
      };
    });
    
    return accusationData;
  }

  cleanup(roomId) {
    console.log(`GameStateManager: Cleaning up room ${roomId}`);
    this.roomStates.delete(roomId);
  }
} 