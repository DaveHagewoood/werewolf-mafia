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
  DISCONNECT: 'disconnect'
}

export const GAME_CONFIG = {
  MIN_PLAYERS: 5,
  MAX_PLAYERS: 15,
  ROOM_ID_LENGTH: 4,
  MAFIA_VOTE_CONSENSUS_TIME: 5000, // 5 seconds in milliseconds
  ELIMINATION_COUNTDOWN_TIME: 10000 // 10 seconds in milliseconds
}

// Role Definitions
export const ROLES = {
  MAFIA: {
    name: 'Mafia',
    alignment: 'evil',
    description: 'You are part of the mafia. Your goal is to eliminate all villagers.',
    ability: 'Each night, you and other mafia members can eliminate one player.',
    color: '#dc2626' // red
  },
  SEER: {
    name: 'Seer',
    alignment: 'good',
    description: 'You are a villager with special powers. Find the mafia before they eliminate you.',
    ability: 'Each night, you may investigate one player to learn their alignment.',
    color: '#7c3aed' // purple
  },
  DOCTOR: {
    name: 'Doctor',
    alignment: 'good',
    description: 'You are a villager with healing powers. Protect the innocent from the mafia.',
    ability: 'Each night, you may protect one player from elimination.',
    color: '#059669' // green
  },
  VILLAGER: {
    name: 'Villager',
    alignment: 'good',
    description: 'You are an ordinary villager. Work with others to identify and eliminate the mafia.',
    ability: 'Vote during the day phase to eliminate suspected mafia members.',
    color: '#0284c7' // blue
  }
}

// Role Assignment Logic
export function assignRoles(playerCount) {
  if (playerCount < GAME_CONFIG.MIN_PLAYERS) {
    throw new Error(`Need at least ${GAME_CONFIG.MIN_PLAYERS} players`)
  }

  const roles = []
  
  // Determine mafia count based on player count
  const mafiaCount = playerCount <= 7 ? 1 : 2
  
  // Add mafia roles
  for (let i = 0; i < mafiaCount; i++) {
    roles.push(ROLES.MAFIA)
  }
  
  // Add special roles
  roles.push(ROLES.SEER)
  roles.push(ROLES.DOCTOR)
  
  // Fill remaining slots with villagers
  const remainingSlots = playerCount - roles.length
  for (let i = 0; i < remainingSlots; i++) {
    roles.push(ROLES.VILLAGER)
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