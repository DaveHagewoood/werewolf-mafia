// Socket Events
export const SOCKET_EVENTS = {
  PLAYER_JOIN: 'player-join',
  PLAYER_JOINED: 'player-joined',
  PLAYERS_UPDATE: 'players-update',
  GAME_START: 'game-start',
  DISCONNECT: 'disconnect'
}

export const GAME_CONFIG = {
  MIN_PLAYERS: 5,
  MAX_PLAYERS: 15,
  ROOM_ID_LENGTH: 4
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
  IN_PROGRESS: 'in-progress',
  ENDED: 'ended'
} 