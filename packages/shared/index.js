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
  SUSPICION_VOTE: 'suspicion-vote',
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
  // Session-based connection (NEW)
  SESSION_JOIN: 'session-join',
  SESSION_JOINED: 'session-joined',
  SESSION_RECONNECT: 'session-reconnect',
  CONNECTION_STATUS_UPDATE: 'connection-status-update',
  // State management
  GAME_STATE_UPDATE: 'game-state-update'
}

// Session-based connection states (NEW)
export const ConnectionStatus = {
  CONNECTED: 'CONNECTED',
  RECONNECTING: 'RECONNECTING', 
  DISCONNECTED: 'DISCONNECTED'
};

export const GAME_CONFIG = {
  MIN_PLAYERS: 5,
  MAX_PLAYERS: 15,
  ROOM_ID_LENGTH: 4,
  MAFIA_VOTE_CONSENSUS_TIME: 5000, // 5 seconds in milliseconds
  ELIMINATION_COUNTDOWN_TIME: 10000, // 10 seconds in milliseconds
  SESSION_TOKEN_LENGTH: 16
}

// Session Configuration (NEW)
export const SESSION_CONFIG = {
  TOKEN_EXPIRY_HOURS: 24, // Session tokens valid for 24 hours
  RECONNECT_GRACE_PERIOD: 30000, // 30 seconds before showing disconnect UI
  MAX_RECONNECT_ATTEMPTS: 3,
  RECONNECT_INTERVAL: 2000 // 2 seconds between attempts
}

// Session Token Utilities (NEW)
export function generateSessionToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < GAME_CONFIG.SESSION_TOKEN_LENGTH; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export function isSessionTokenValid(sessionData) {
  if (!sessionData || !sessionData.createdAt) return false
  const now = Date.now()
  const expiryTime = sessionData.createdAt + (SESSION_CONFIG.TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)
  return now < expiryTime
}

// Standardized Powers (consistent across all themes)
export const POWERS = {
  KILL: 'kill',
  HEAL: 'heal',
  INVESTIGATE: 'investigate',
  CITIZEN: 'citizen'
}

// Evil Themes with role names and metadata
export const EVIL_THEMES = {
  WEREWOLF: {
    id: 'werewolf',
    name: 'Werewolf',
    description: 'Ancient lycanthropes terrorize the village under moonlight',
    evilName: 'Werewolves',
    citizenName: 'Villagers',
    settingName: 'Village',
    roles: {
      [POWERS.KILL]: {
        name: 'Werewolf',
        power: POWERS.KILL,
        powerName: 'KILL',
        alignment: 'evil',
        description: 'You are a werewolf. Your goal is to eliminate all villagers.',
        ability: 'Each night, you and other werewolves can eliminate one player.',
        color: '#dc2626' // red
      },
      [POWERS.HEAL]: {
        name: 'Healer',
        power: POWERS.HEAL,
        powerName: 'HEAL',
        alignment: 'good',
        description: 'You are a villager with healing powers. Protect the innocent from the werewolves.',
        ability: 'Each night, you may protect one player from elimination.',
        color: '#059669' // green
      },
      [POWERS.INVESTIGATE]: {
        name: 'Seer',
        power: POWERS.INVESTIGATE,
        powerName: 'INVESTIGATE',
        alignment: 'good',
        description: 'You are a villager with mystical powers. Find the werewolves before they eliminate you.',
        ability: 'Each night, you may investigate one player to learn their alignment.',
        color: '#7c3aed' // purple
      },
      [POWERS.CITIZEN]: {
        name: 'Villager',
        power: POWERS.CITIZEN,
        powerName: 'CITIZEN',
        alignment: 'good',
        description: 'You are an ordinary villager. Work with others to identify and eliminate the werewolves.',
        ability: 'Vote during the day phase to eliminate suspected werewolves.',
        color: '#0284c7' // blue
      }
    }
  },
  MAFIA: {
    id: 'mafia',
    name: 'Mafia',
    description: 'Organized crime families control the city through fear and violence',
    evilName: 'Mafia',
    citizenName: 'Townspeople',
    settingName: 'City',
    roles: {
      [POWERS.KILL]: {
        name: 'Mafioso',
        power: POWERS.KILL,
        powerName: 'KILL',
        alignment: 'evil',
        description: 'You are part of the mafia. Your goal is to eliminate all townspeople.',
        ability: 'Each night, you and other mafia members can eliminate one player.',
        color: '#dc2626' // red
      },
      [POWERS.HEAL]: {
        name: 'Doctor',
        power: POWERS.HEAL,
        powerName: 'HEAL',
        alignment: 'good',
        description: 'You are a doctor with medical skills. Protect the innocent from the mafia.',
        ability: 'Each night, you may protect one player from elimination.',
        color: '#059669' // green
      },
      [POWERS.INVESTIGATE]: {
        name: 'Detective',
        power: POWERS.INVESTIGATE,
        powerName: 'INVESTIGATE',
        alignment: 'good',
        description: 'You are a detective with investigative skills. Find the mafia before they eliminate you.',
        ability: 'Each night, you may investigate one player to learn their alignment.',
        color: '#7c3aed' // purple
      },
      [POWERS.CITIZEN]: {
        name: 'Townsperson',
        power: POWERS.CITIZEN,
        powerName: 'CITIZEN',
        alignment: 'good',
        description: 'You are an ordinary townsperson. Work with others to identify and eliminate the mafia.',
        ability: 'Vote during the day phase to eliminate suspected mafia members.',
        color: '#0284c7' // blue
      }
    }
  },
  VAMPIRE: {
    id: 'vampire',
    name: 'Vampire',
    description: 'Undead bloodsuckers hunt in the shadows of the night',
    evilName: 'Vampires',
    citizenName: 'Mortals',
    settingName: 'Town',
    roles: {
      [POWERS.KILL]: {
        name: 'Vampire',
        power: POWERS.KILL,
        powerName: 'KILL',
        alignment: 'evil',
        description: 'You are a vampire. Your goal is to drain the life from all mortals.',
        ability: 'Each night, you and other vampires can eliminate one player.',
        color: '#dc2626' // red
      },
      [POWERS.HEAL]: {
        name: 'Priest',
        power: POWERS.HEAL,
        powerName: 'HEAL',
        alignment: 'good',
        description: 'You are a holy priest with divine powers. Protect the innocent from the vampires.',
        ability: 'Each night, you may protect one player from elimination.',
        color: '#059669' // green
      },
      [POWERS.INVESTIGATE]: {
        name: 'Oracle',
        power: POWERS.INVESTIGATE,
        powerName: 'INVESTIGATE',
        alignment: 'good',
        description: 'You are an oracle with mystical sight. Find the vampires before they drain you.',
        ability: 'Each night, you may investigate one player to learn their alignment.',
        color: '#7c3aed' // purple
      },
      [POWERS.CITIZEN]: {
        name: 'Mortal',
        power: POWERS.CITIZEN,
        powerName: 'CITIZEN',
        alignment: 'good',
        description: 'You are an ordinary mortal. Work with others to identify and eliminate the vampires.',
        ability: 'Vote during the day phase to eliminate suspected vampires.',
        color: '#0284c7' // blue
      }
    }
  },
  CARTEL: {
    id: 'cartel',
    name: 'Cartel',
    description: 'Drug cartels wage war for control of the border town',
    evilName: 'Cartel',
    citizenName: 'Citizens',
    settingName: 'Border Town',
    roles: {
      [POWERS.KILL]: {
        name: 'Sicario',
        power: POWERS.KILL,
        powerName: 'KILL',
        alignment: 'evil',
        description: 'You are a cartel assassin. Your goal is to eliminate all who oppose the cartel.',
        ability: 'Each night, you and other sicarios can eliminate one player.',
        color: '#dc2626' // red
      },
      [POWERS.HEAL]: {
        name: 'Medic',
        power: POWERS.HEAL,
        powerName: 'HEAL',
        alignment: 'good',
        description: 'You are a field medic. Protect the innocent from cartel violence.',
        ability: 'Each night, you may protect one player from elimination.',
        color: '#059669' // green
      },
      [POWERS.INVESTIGATE]: {
        name: 'Agent',
        power: POWERS.INVESTIGATE,
        powerName: 'INVESTIGATE',
        alignment: 'good',
        description: 'You are an undercover agent. Find the cartel members before they eliminate you.',
        ability: 'Each night, you may investigate one player to learn their alignment.',
        color: '#7c3aed' // purple
      },
      [POWERS.CITIZEN]: {
        name: 'Citizen',
        power: POWERS.CITIZEN,
        powerName: 'CITIZEN',
        alignment: 'good',
        description: 'You are an ordinary citizen caught in cartel war. Work with others to identify the criminals.',
        ability: 'Vote during the day phase to eliminate suspected cartel members.',
        color: '#0284c7' // blue
      }
    }
  }
}

// Legacy Game Types (for backwards compatibility)
export const GAME_TYPES = {
  WEREWOLF: 'werewolf',
  MAFIA: 'mafia',
  VAMPIRE: 'vampire',
  CARTEL: 'cartel'
}

// Helper functions for the new theme system
export function getTheme(themeId) {
  return EVIL_THEMES[themeId.toUpperCase()] || EVIL_THEMES.WEREWOLF
}

export function getRoleByPower(themeId, power) {
  const theme = getTheme(themeId)
  return theme.roles[power]
}

export function createRoleWithPowerDescription(themeId, power) {
  const role = getRoleByPower(themeId, power)
  if (!role) return null
  
  // Create a natural power description based on the role type
  let powerDescription
  if (power === POWERS.CITIZEN) {
    powerDescription = `You are a ${role.name}, and your role is to identify and eliminate the killers`
  } else {
    powerDescription = `You are a ${role.name}, and you have the power to ${role.powerName}`
  }
  
  return {
    ...role,
    powerDescription: powerDescription
  }
}

export function getThemeList() {
  return Object.values(EVIL_THEMES).map(theme => ({
    id: theme.id,
    name: theme.name,
    description: theme.description
  }))
}

// Legacy ROLE_SETS for backwards compatibility
export const ROLE_SETS = {
  [GAME_TYPES.WEREWOLF]: {
    EVIL: EVIL_THEMES.WEREWOLF.roles[POWERS.KILL],
    INVESTIGATOR: EVIL_THEMES.WEREWOLF.roles[POWERS.INVESTIGATE],
    PROTECTOR: EVIL_THEMES.WEREWOLF.roles[POWERS.HEAL],
    CITIZEN: EVIL_THEMES.WEREWOLF.roles[POWERS.CITIZEN]
  },
  [GAME_TYPES.MAFIA]: {
    EVIL: EVIL_THEMES.MAFIA.roles[POWERS.KILL],
    INVESTIGATOR: EVIL_THEMES.MAFIA.roles[POWERS.INVESTIGATE],
    PROTECTOR: EVIL_THEMES.MAFIA.roles[POWERS.HEAL],
    CITIZEN: EVIL_THEMES.MAFIA.roles[POWERS.CITIZEN]
  }
}

// Legacy ROLES export for backward compatibility (defaults to Werewolf)
export const ROLES = ROLE_SETS[GAME_TYPES.WEREWOLF]

// Profile Images by Theme - temporarily all use werewolf images
const WEREWOLF_IMAGES = [
  'wolf_1', 'wolf_2', 'wolf_3', 'wolf_4', 'wolf_5', 'wolf_6', 'wolf_7', 'wolf_8', 'wolf_9', 'wolf_10',
  'wolf_11', 'wolf_12', 'wolf_13', 'wolf_14', 'wolf_15', 'wolf_16', 'wolf_17', 'wolf_18', 'wolf_19', 'wolf_20',
  'wolf_21', 'wolf_22', 'wolf_23', 'wolf_24', 'wolf_25', 'wolf_26', 'wolf_27', 'wolf_28', 'wolf_29', 'wolf_30',
  'wolf_31', 'wolf_32', 'wolf_33'
]

export const PROFILE_IMAGES = {
  [GAME_TYPES.WEREWOLF]: WEREWOLF_IMAGES,
  [GAME_TYPES.MAFIA]: WEREWOLF_IMAGES,
  [GAME_TYPES.VAMPIRE]: WEREWOLF_IMAGES,
  [GAME_TYPES.CARTEL]: WEREWOLF_IMAGES
}

export function getProfileImageUrl(themeId, imageName, useWebP = true) {
  // Temporarily use werewolf images for all themes until other theme images are set up
  const gameFolder = 'Werewolf'
  const extension = useWebP ? '.webp' : '.png'
  const url = `/images/ProfileImages/${gameFolder}/${imageName}${extension}`
  console.log(`🖼️ getProfileImageUrl: theme=${themeId}, image=${imageName}, webp=${useWebP} -> ${url}`)
  return url
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

// Role Assignment Logic (updated for new theme system)
export function assignRoles(playerCount, themeId = GAME_TYPES.WEREWOLF) {
  if (playerCount < GAME_CONFIG.MIN_PLAYERS) {
    throw new Error(`Need at least ${GAME_CONFIG.MIN_PLAYERS} players`)
  }

  const theme = getTheme(themeId)
  const roles = []
  
  // Determine evil count based on player count
  const evilCount = playerCount <= 7 ? 1 : 2
  
  // Add evil roles (KILL power)
  for (let i = 0; i < evilCount; i++) {
    roles.push(createRoleWithPowerDescription(themeId, POWERS.KILL))
  }
  
  // Add special roles  
  roles.push(createRoleWithPowerDescription(themeId, POWERS.INVESTIGATE)) // Seer/Detective/Oracle/Agent
  roles.push(createRoleWithPowerDescription(themeId, POWERS.HEAL)) // Healer/Doctor/Priest/Medic
  
  // Fill remaining slots with citizens
  const remainingSlots = playerCount - roles.length
  for (let i = 0; i < remainingSlots; i++) {
    roles.push(createRoleWithPowerDescription(themeId, POWERS.CITIZEN))
  }
  
  // Shuffle roles randomly
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]]
  }
  
  return roles
}

// Legacy function for backwards compatibility
export function assignRolesByGameType(playerCount, gameType = GAME_TYPES.WEREWOLF) {
  return assignRoles(playerCount, gameType)
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
  STORY_INTRO: 'story-intro',
  NIGHT_PHASE: 'night-phase',
  NIGHT_RESOLVED: 'night-resolved',
  DAY_PHASE: 'day-phase',
  DAY_RESOLVED: 'day-resolved',
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
          
        } else if (playerRole && playerRole.power === POWERS.HEAL) {
          nightState.availableTargets = room.players
            .filter(p => room.alivePlayers.has(p.id))
            .map(p => ({ id: p.id, name: p.name }));
          nightState.selectedHeal = room.healActions?.get(playerId) || null;
          
        } else if (playerRole && playerRole.power === POWERS.INVESTIGATE) {
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