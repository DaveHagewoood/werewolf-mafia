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
  DISCONNECT: 'disconnect'
}

export const GAME_CONFIG = {
  MIN_PLAYERS: 5,
  MAX_PLAYERS: 15,
  ROOM_ID_LENGTH: 4,
  MAFIA_VOTE_CONSENSUS_TIME: 5000, // 5 seconds in milliseconds
  ELIMINATION_COUNTDOWN_TIME: 10000 // 10 seconds in milliseconds
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