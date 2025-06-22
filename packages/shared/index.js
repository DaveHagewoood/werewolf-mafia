// Socket Events
export const SOCKET_EVENTS = {
  PLAYER_JOIN: 'player-join',
  PLAYER_JOINED: 'player-joined',
  PLAYERS_UPDATE: 'players-update',
  GAME_START: 'game-start',
  ROLE_ASSIGNED: 'role-assigned',
  PLAYER_READY: 'player-ready',
  READINESS_UPDATE: 'readiness-update',
  START_NIGHT_PHASE: 'start-night-phase',
  BEGIN_MAFIA_VOTE: 'begin-mafia-vote',
  MAFIA_VOTE: 'mafia-vote',
  MAFIA_VOTES_UPDATE: 'mafia-votes-update',
  CONSENSUS_TIMER_START: 'consensus-timer-start',
  CONSENSUS_TIMER_CANCELLED: 'consensus-timer-cancelled',
  MAFIA_VOTES_LOCKED: 'mafia-votes-locked',
  BEGIN_DOCTOR_ACTION: 'begin-doctor-action',
  DOCTOR_HEAL: 'doctor-heal',
  BEGIN_SEER_ACTION: 'begin-seer-action',
  SEER_INVESTIGATE: 'seer-investigate',
  SEER_RESULT: 'seer-result',
  NIGHT_RESOLUTION: 'night-resolution',
  START_DAY_PHASE: 'start-day-phase',
  PLAYER_ACCUSE: 'player-accuse',
  ACCUSATIONS_UPDATE: 'accusations-update',
  ELIMINATION_COUNTDOWN: 'elimination-countdown',
  COUNTDOWN_CANCELLED: 'countdown-cancelled',
  PLAYER_ELIMINATED: 'player-eliminated',
  NIGHT_ACTION_COMPLETE: 'night-action-complete',
  GAME_END: 'game-end',
  SELECT_GAME_TYPE: 'select-game-type',
  GAME_TYPE_SELECTED: 'game-type-selected',
  SELECT_PROFILE_IMAGE: 'select-profile-image',
  PROFILE_IMAGE_SELECTED: 'profile-image-selected',
  GET_ROOM_INFO: 'get-room-info',
  ROOM_INFO: 'room-info',
  // Connection management
  PLAYER_RECONNECT: 'player-reconnect',
  PLAYER_RECONNECTED: 'player-reconnected',
  PLAYER_DISCONNECTED: 'player-disconnected',
  CONNECTION_STATUS: 'connection-status',
  HEARTBEAT: 'heartbeat',
  HEARTBEAT_RESPONSE: 'heartbeat-response',
  GAME_PAUSED: 'game-paused',
  GAME_RESUMED: 'game-resumed',
  DISCONNECT: 'disconnect',
  // Enhanced reconnection events
  STATE_SYNC_REQUEST: 'state-sync-request',
  STATE_SYNC_RESPONSE: 'state-sync-response',
  RECONNECTION_FAILED: 'reconnection-failed',
  CLIENT_PAUSED: 'client-paused',
  VERSION_MISMATCH: 'version-mismatch',
  // State management
  GAME_STATE_UPDATE: 'game-state-update'
}

// Connection state enums
export const PlayerConnectionState = {
  CONNECTED: 'CONNECTED',
  ATTEMPTING_RECONNECTION: 'ATTEMPTING_RECONNECTION',
  PAUSED: 'PAUSED',
  DISCONNECTED: 'DISCONNECTED'
};

export const GameConnectionState = {
  ACTIVE: 'ACTIVE',
  PAUSED_RECONNECTING: 'PAUSED_RECONNECTING',
  ENDED: 'ENDED'
};

// Reconnection protocol configuration
export const RECONNECTION_CONFIG = {
  maxAttempts: 5,
  attemptDelay: 1000,
  escalationFactor: 1.5,
  maxDelay: 5000,
  totalTimeout: 30000
};

export const GAME_CONFIG = {
  MIN_PLAYERS: 5,
  MAX_PLAYERS: 15,
  ROOM_ID_LENGTH: 4,
  MAFIA_VOTE_CONSENSUS_TIME: 5000, // 5 seconds in milliseconds
  ELIMINATION_COUNTDOWN_TIME: 10000 // 10 seconds in milliseconds
}

// Connection Configuration
export const CONNECTION_CONFIG = {
  RECONNECT_TIMEOUT: 15000, // 15 seconds in milliseconds
  MIN_CONNECTED_PERCENTAGE: 0.75, // 75% of players must be connected
  HEARTBEAT_INTERVAL: 5000, // 5 seconds in milliseconds
  HEARTBEAT_TIMEOUT: 10000, // 10 seconds in milliseconds
  CLEANUP_INTERVAL: 30000 // 30 seconds in milliseconds
}

// Game Types
export const GAME_TYPES = {
  WEREWOLF: 'werewolf',
  MAFIA: 'mafia'
}

// Role Definitions by Game Type
export const ROLE_SETS = {
  [GAME_TYPES.WEREWOLF]: {
    EVIL: {
      name: 'Werewolf',
      alignment: 'evil',
      description: 'You are a werewolf. Your goal is to eliminate all villagers.',
      ability: 'Each night, you and other werewolves can eliminate one player.',
      color: '#dc2626' // red
    },
    INVESTIGATOR: {
      name: 'Seer',
      alignment: 'good',
      description: 'You are a villager with mystical powers. Find the werewolves before they eliminate you.',
      ability: 'Each night, you may investigate one player to learn their alignment.',
      color: '#7c3aed' // purple
    },
    PROTECTOR: {
      name: 'Healer',
      alignment: 'good',
      description: 'You are a villager with healing powers. Protect the innocent from the werewolves.',
      ability: 'Each night, you may protect one player from elimination.',
      color: '#059669' // green
    },
    CITIZEN: {
      name: 'Villager',
      alignment: 'good',
      description: 'You are an ordinary villager. Work with others to identify and eliminate the werewolves.',
      ability: 'Vote during the day phase to eliminate suspected werewolves.',
      color: '#0284c7' // blue
    }
  },
  [GAME_TYPES.MAFIA]: {
    EVIL: {
      name: 'Mafia',
      alignment: 'evil',
      description: 'You are part of the mafia. Your goal is to eliminate all townspeople.',
      ability: 'Each night, you and other mafia members can eliminate one player.',
      color: '#dc2626' // red
    },
    INVESTIGATOR: {
      name: 'Detective',
      alignment: 'good',
      description: 'You are a detective with investigative skills. Find the mafia before they eliminate you.',
      ability: 'Each night, you may investigate one player to learn their alignment.',
      color: '#7c3aed' // purple
    },
    PROTECTOR: {
      name: 'Doctor',
      alignment: 'good',
      description: 'You are a doctor with medical skills. Protect the innocent from the mafia.',
      ability: 'Each night, you may protect one player from elimination.',
      color: '#059669' // green
    },
    CITIZEN: {
      name: 'Townsperson',
      alignment: 'good',
      description: 'You are an ordinary townsperson. Work with others to identify and eliminate the mafia.',
      ability: 'Vote during the day phase to eliminate suspected mafia members.',
      color: '#0284c7' // blue
    }
  }
}

// Legacy ROLES export for backward compatibility (defaults to Werewolf)
export const ROLES = ROLE_SETS[GAME_TYPES.WEREWOLF]

// Profile Images
export const PROFILE_IMAGES = {
  [GAME_TYPES.WEREWOLF]: [
    'wolf_1', 'wolf_2', 'wolf_3', 'wolf_4', 'wolf_5', 'wolf_6', 'wolf_7', 'wolf_8', 'wolf_9', 'wolf_10',
    'wolf_11', 'wolf_12', 'wolf_13', 'wolf_14', 'wolf_15', 'wolf_16', 'wolf_17', 'wolf_18', 'wolf_19', 'wolf_20',
    'wolf_21', 'wolf_22', 'wolf_23', 'wolf_24', 'wolf_25', 'wolf_26', 'wolf_27', 'wolf_28', 'wolf_29', 'wolf_30',
    'wolf_31', 'wolf_32', 'wolf_33'
  ],
  [GAME_TYPES.MAFIA]: [
    'mafia_1', 'mafia_2', 'mafia_3', 'mafia_4', 'mafia_5', 'mafia_6', 'mafia_7', 'mafia_8', 'mafia_9', 'mafia_10',
    'mafia_11', 'mafia_12', 'mafia_13', 'mafia_14', 'mafia_15', 'mafia_16', 'mafia_17', 'mafia_18', 'mafia_19', 'mafia_20',
    'mafia_21', 'mafia_22', 'mafia_23', 'mafia_24', 'mafia_25', 'mafia_26', 'mafia_27', 'mafia_28', 'mafia_29', 'mafia_30',
    'mafia_31', 'mafia_32', 'mafia_33', 'mafia_34', 'mafia_35', 'mafia_36', 'mafia_37', 'mafia_38', 'mafia_39'
  ]
}

export function getProfileImageUrl(gameType, imageName, useWebP = true) {
  const gameFolder = gameType === GAME_TYPES.WEREWOLF ? 'Werewolf' : 'Mafia'
  const extension = useWebP ? '.webp' : '.png'
  return `/images/ProfileImages/${gameFolder}/${imageName}${extension}`
}

// WebP detection for profile images
export function checkWebPSupport() {
  return new Promise((resolve) => {
    const webP = new Image()
    webP.onload = webP.onerror = () => {
      resolve(webP.height === 2)
    }
    webP.src = 'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA'
  })
}

// Role Assignment Logic
export function assignRoles(playerCount, gameType = GAME_TYPES.WEREWOLF) {
  if (playerCount < GAME_CONFIG.MIN_PLAYERS) {
    throw new Error(`Need at least ${GAME_CONFIG.MIN_PLAYERS} players`)
  }

  const roleSet = ROLE_SETS[gameType]
  const roles = []
  
  // Determine evil count based on player count
  const evilCount = playerCount <= 7 ? 1 : 2
  
  // Add evil roles
  for (let i = 0; i < evilCount; i++) {
    roles.push(roleSet.EVIL)
  }
  
  // Add special roles
  roles.push(roleSet.INVESTIGATOR)
  roles.push(roleSet.PROTECTOR)
  
  // Fill remaining slots with citizens
  const remainingSlots = playerCount - roles.length
  for (let i = 0; i < remainingSlots; i++) {
    roles.push(roleSet.CITIZEN)
  }
  
  // Shuffle roles randomly
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]]
  }
  
  return roles
}

export const generateRoomId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < GAME_CONFIG.ROOM_ID_LENGTH; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export const validatePlayerName = (name) => {
  if (!name || typeof name !== 'string') return false
  const trimmed = name.trim()
  return trimmed.length >= 2 && trimmed.length <= 20
}

// Game States
export const GAME_STATES = {
  MAIN_MENU: 'main-menu',
  LOBBY: 'lobby',
  STARTING: 'starting',
  ROLE_ASSIGNMENT: 'role-assignment',
  NIGHT_PHASE: 'night-phase',
  DAY_PHASE: 'day-phase',
  IN_PROGRESS: 'in-progress',
  ENDED: 'ended'
}

// Game Phases
export const PHASES = {
  NIGHT: 'night',
  DAY: 'day'
}

// Player-specific game state view
export const getPlayerGameState = (room, playerId, helpers = {}) => {
  const baseState = {
    gameState: room.gameState,
    playerId: playerId,
    playerName: room.players.find(p => p.id === playerId)?.name,
    gamePaused: room.gamePaused,
    pauseReason: room.pauseReason,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      isReady: room.playerReadiness.get(p.id) || false
    }))
  };

  // Add phase-specific state
  switch (room.gameState) {
    case GAME_STATES.LOBBY:
      return {
        ...baseState,
        canStart: room.players.length >= GAME_CONFIG.MIN_PLAYERS,
        gameType: room.gameType
      };

    case GAME_STATES.ROLE_ASSIGNMENT:
      return {
        ...baseState,
        role: room.playerRoles.get(playerId),
        isReady: room.playerReadiness.get(playerId) || false
      };

    case GAME_STATES.NIGHT_PHASE:
      const playerRole = room.playerRoles.get(playerId);
      const isAlive = room.alivePlayers.has(playerId);
      const nightState = {
        ...baseState,
        role: playerRole,
        isAlive,
        eliminatedPlayer: room.eliminatedPlayer,
        savedPlayer: room.savedPlayer,
        mafiaVotesLocked: room.mafiaVotesLocked || false,
        consensusTimer: room.consensusTimer || null,
        hasHealed: room.healActions && room.healActions.has(playerId),
        hasInvestigated: room.investigationActions && room.investigationActions.has(playerId),
        investigationResult: room.investigationResults?.get(playerId) || null
      };

      // Add role-specific actions
      if (isAlive && helpers.getAliveNonMafiaPlayers) {
        if (playerRole && playerRole.alignment === 'evil') {
          nightState.availableTargets = helpers.getAliveNonMafiaPlayers(room)
            .map(p => ({ id: p.id, name: p.name }));
          
          // Add current votes and player's vote status
          nightState.currentVotes = Array.from(room.mafiaVotes.entries()).map(([voterId, targetId]) => {
            const voter = room.players.find(p => p.id === voterId);
            const target = room.players.find(p => p.id === targetId);
            return {
              voterId,
              voterName: voter?.name || 'Unknown',
              targetId,
              targetName: target?.name || 'Unknown'
            };
          });
          
          nightState.selectedTarget = room.mafiaVotes.get(playerId) || null;
          nightState.hasVoted = room.mafiaVotes.has(playerId);
          
        } else if (playerRole && (playerRole.name === 'Doctor' || playerRole.name === 'Protector')) {
          nightState.availableTargets = room.players
            .filter(p => room.alivePlayers.has(p.id))
            .map(p => ({ id: p.id, name: p.name }));
          nightState.selectedHeal = room.healActions?.get(playerId) || null;
          
        } else if (playerRole && (playerRole.name === 'Seer' || playerRole.name === 'Investigator')) {
          nightState.availableTargets = room.players
            .filter(p => room.alivePlayers.has(p.id) && p.id !== playerId)
            .map(p => ({ id: p.id, name: p.name }));
          nightState.selectedInvestigation = room.investigationActions?.get(playerId) || null;
        }
      }
      return nightState;

    case GAME_STATES.DAY_PHASE:
      return {
        ...baseState,
        role: room.playerRoles.get(playerId),
        isAlive: room.alivePlayers.has(playerId),
        accusations: Array.from(room.accusations.entries()),
        eliminationCountdown: room.eliminationCountdown,
        dayEliminatedPlayer: room.dayEliminatedPlayer,
        alivePlayers: room.players
          .filter(p => room.alivePlayers.has(p.id))
          .map(p => ({ id: p.id, name: p.name }))
      };

    case GAME_STATES.ENDED:
      return {
        ...baseState,
        role: room.playerRoles.get(playerId),
        winner: room.winner,
        winCondition: room.winCondition,
        alivePlayers: Array.from(room.alivePlayers),
        allPlayers: room.players.map(p => ({
          id: p.id,
          name: p.name,
          role: room.playerRoles.get(p.id),
          alive: room.alivePlayers.has(p.id)
        }))
      };

    default:
      return baseState;
  }
}; 