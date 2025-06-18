import { Server } from 'socket.io'
import { createServer } from 'http'
import { SOCKET_EVENTS, validatePlayerName, GAME_CONFIG, GAME_STATES, PHASES, ROLES, ROLE_SETS, GAME_TYPES, PROFILE_IMAGES, getProfileImageUrl, assignRoles, CONNECTION_CONFIG } from '@werewolf-mafia/shared'

const httpServer = createServer()
const port = process.env.PORT || 3002

// Configure CORS for both development and production
const allowedOrigins = [
  // Development URLs
  "http://localhost:3000", // Host Dev URL
  "http://localhost:3001", // Player Dev URL
  // Production URLs (Render.com)
  "https://werewolf-mafia-host.onrender.com",
  "https://werewolf-mafia-player.onrender.com"
]

// Add production URLs from environment variables (if different from default Render URLs)
if (process.env.HOST_URL && !allowedOrigins.includes(process.env.HOST_URL)) {
  allowedOrigins.push(process.env.HOST_URL)
}
if (process.env.PLAYER_URL && !allowedOrigins.includes(process.env.PLAYER_URL)) {
  allowedOrigins.push(process.env.PLAYER_URL)
}

console.log('Starting server with allowed origins:', allowedOrigins)

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket'],
  allowUpgrades: false,
  pingTimeout: 30000,
  pingInterval: 10000
})

// Store game rooms in memory
const gameRooms = new Map()

// Store game types for each room
const roomGameTypes = new Map()

// Store player connection data
const playerConnections = new Map() // playerId -> { lastHeartbeat, reconnectTimer }

// Start listening on the configured port
httpServer.listen(port, '0.0.0.0', (err) => {
  if (err) {
    console.error('Failed to start server:', err)
    process.exit(1)
  }
  console.log(`Server running on port ${port}`)
  console.log('Environment:', {
    NODE_ENV: process.env.NODE_ENV,
    HOST_URL: process.env.HOST_URL,
    PLAYER_URL: process.env.PLAYER_URL,
    PORT: process.env.PORT
  })
})

// Handle server shutdown gracefully
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully')
  httpServer.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

// Helper function to get or create room
function getRoom(roomId) {
  if (!gameRooms.has(roomId)) {
    gameRooms.set(roomId, {
      id: roomId,
      host: null,
      players: [],
      gameState: GAME_STATES.LOBBY,
      currentPhase: null,
      playerRoles: new Map(), // playerId -> role
      playerReadiness: new Map(), // playerId -> boolean
      alivePlayers: new Set(), // Set of alive player IDs
      mafiaVotes: new Map(), // mafiaPlayerId -> targetPlayerId
      voteConsensusTimer: null,
      mafiaVotesLocked: false, // Whether Mafia votes are locked in
      healedPlayerId: null, // Doctor's heal target
      seerInvestigatedPlayerId: null, // Seer's investigation target
      accusations: new Map(), // accusedPlayerId -> Set of voterPlayerIds
      eliminationCountdown: null, // Timer for elimination countdown
      gamePaused: false, // Whether game is paused due to disconnections
      pauseReason: null, // Reason for game pause  
      createdAt: new Date()
    })
  }
  return gameRooms.get(roomId)
}

// Helper function to get Mafia players
function getMafiaPlayers(room) {
  return room.players.filter(player => {
    const role = room.playerRoles.get(player.id)
    return role?.alignment === 'evil' && room.alivePlayers.has(player.id)
  })
}

// Helper function to get alive non-Mafia players
function getAliveNonMafiaPlayers(room) {
  return room.players.filter(player => {
    const role = room.playerRoles.get(player.id)
    return role?.alignment !== 'evil' && room.alivePlayers.has(player.id)
  })
}

// Helper function to get Doctor players (Protector role)
function getDoctorPlayers(room, roomId) {
  const gameType = roomGameTypes.get(roomId) || GAME_TYPES.WEREWOLF
  const roleSet = ROLE_SETS[gameType]
  return room.players.filter(player => {
    const role = room.playerRoles.get(player.id)
    return role?.name === roleSet.PROTECTOR.name && room.alivePlayers.has(player.id)
  })
}

// Helper function to get Seer players (Investigator role)
function getSeerPlayers(room, roomId) {
  const gameType = roomGameTypes.get(roomId) || GAME_TYPES.WEREWOLF
  const roleSet = ROLE_SETS[gameType]
  return room.players.filter(player => {
    const role = room.playerRoles.get(player.id)
    return role?.name === roleSet.INVESTIGATOR.name && room.alivePlayers.has(player.id)
  })
}

// Helper function to broadcast current Mafia votes to all Mafia players
function broadcastMafiaVotes(room) {
  const mafiaPlayers = getMafiaPlayers(room)
  const voteData = {}
  
  // Build vote data: { playerId: { name: "PlayerName", target: "targetId" || null } }
  mafiaPlayers.forEach(mafiaPlayer => {
    const targetId = room.mafiaVotes.get(mafiaPlayer.id) || null
    const targetPlayer = targetId ? room.players.find(p => p.id === targetId) : null
    
    voteData[mafiaPlayer.id] = {
      name: mafiaPlayer.name,
      target: targetId,
      targetName: targetPlayer?.name || null
    }
  })
  
  // Send to all Mafia players
  mafiaPlayers.forEach(mafiaPlayer => {
    const mafiaSocket = io.sockets.sockets.get(mafiaPlayer.id)
    if (mafiaSocket) {
      mafiaSocket.emit(SOCKET_EVENTS.MAFIA_VOTES_UPDATE, { votes: voteData })
    }
  })
}

// Helper function to check Mafia vote consensus
function checkMafiaVoteConsensus(room) {
  const mafiaPlayers = getMafiaPlayers(room)
  const votes = Array.from(room.mafiaVotes.values())
  
  // Need all mafia to vote
  if (room.mafiaVotes.size !== mafiaPlayers.length) {
    return null
  }
  
  // Check if all votes are for the same target
  const firstVote = votes[0]
  const allSameTarget = votes.every(vote => vote === firstVote)
  
  return allSameTarget ? firstVote : null
}

// Helper function to check night phase progression when players disconnect
function checkNightPhaseProgression(room, roomId) {
  console.log(`Checking night phase progression in room ${roomId}`)
  
  // Check connected players
  const connectedPercentage = getConnectedPlayerPercentage(roomId)
  const shouldPause = connectedPercentage < CONNECTION_CONFIG.MIN_CONNECTED_PERCENTAGE
  
  console.log(`Connected percentage: ${connectedPercentage}, should pause: ${shouldPause}`)
  
  if (shouldPause && !room.gamePaused) {
    // Pause the game due to disconnections
    pauseGame(roomId, 'Key players disconnected during night phase')
    console.log(`Game paused in room ${roomId} due to night phase disconnections`)
  } else if (!shouldPause && room.gamePaused) {
    // Resume the game if enough players reconnected
    resumeGame(roomId)
    console.log(`Game resumed in room ${roomId} - players reconnected`)
  }
  
  // Don't auto-skip actions - wait for players to reconnect or game to be invalidated
}

// Helper function to check if night phase is complete
function checkNightCompletion(room, roomId) {
  // If game is paused due to disconnections, don't check completion
  if (room.gamePaused) {
    console.log(`Night completion check skipped - game is paused in room ${roomId}`)
    return
  }
  
  const mafiaPlayers = getMafiaPlayers(room)
  const doctorPlayers = getDoctorPlayers(room, roomId)
  const seerPlayers = getSeerPlayers(room, roomId)
  
  // Check if Mafia action is complete (consensus reached and timer expired)
  const mafiaTarget = checkMafiaVoteConsensus(room)
  const mafiaActionComplete = mafiaPlayers.length === 0 || (mafiaTarget && !room.voteConsensusTimer) || room.mafiaVotesLocked
  
  // Check if Doctor action is complete (no doctor or doctor has acted)
  const doctorActionComplete = doctorPlayers.length === 0 || room.healedPlayerId !== null
  
  // Check if Seer action is complete (no seer or seer has investigated)
  const seerActionComplete = seerPlayers.length === 0 || room.seerInvestigatedPlayerId !== null
  
  console.log(`Night completion check - Mafia: ${mafiaActionComplete}, Doctor: ${doctorActionComplete}, Seer: ${seerActionComplete}`)
  
  if (mafiaActionComplete && doctorActionComplete && seerActionComplete) {
    // All actions complete, resolve the night
    resolveNightPhase(room, roomId)
  }
}

// Helper function to resolve night phase
function resolveNightPhase(room, roomId) {
  const mafiaTarget = checkMafiaVoteConsensus(room)
  const healedTarget = room.healedPlayerId
  
  let killedPlayer = null
  let savedPlayer = null
  
  console.log(`Resolving night in room ${roomId}: Mafia target=${mafiaTarget}, Healed=${healedTarget}`)
  
  if (mafiaTarget) {
    if (mafiaTarget === healedTarget) {
      // Doctor saved the target!
      savedPlayer = room.players.find(p => p.id === mafiaTarget)
      console.log(`Doctor saved ${savedPlayer?.name} from elimination!`)
    } else {
      // Target is eliminated
      room.alivePlayers.delete(mafiaTarget)
      killedPlayer = room.players.find(p => p.id === mafiaTarget)
      console.log(`${killedPlayer?.name} was eliminated by the Mafia`)
      
      // Send PLAYER_ELIMINATED event to all clients including the killed player
      const killedRole = room.playerRoles.get(mafiaTarget)
      io.to(roomId).emit(SOCKET_EVENTS.PLAYER_ELIMINATED, {
        eliminatedPlayer: {
          id: mafiaTarget,
          name: killedPlayer.name,
          role: killedRole
        },
        roomId: roomId
      })
    }
  }
  
  // Send night resolution to host
  const hostSocket = io.sockets.sockets.get(room.host)
  if (hostSocket) {
    hostSocket.emit(SOCKET_EVENTS.NIGHT_RESOLUTION, {
      killedPlayer: killedPlayer ? { id: killedPlayer.id, name: killedPlayer.name } : null,
      savedPlayer: savedPlayer ? { id: savedPlayer.id, name: savedPlayer.name } : null,
      roomId: roomId
    })
  }
  
  // Reset night phase data
  room.mafiaVotes.clear()
  room.healedPlayerId = null
  room.seerInvestigatedPlayerId = null
  room.voteConsensusTimer = null
  room.mafiaVotesLocked = false
  
  console.log(`Night resolution sent to host for room ${roomId}`)
  
  // Check for win conditions after night resolution
  const gameEnded = checkWinConditions(room, roomId)
  if (gameEnded) {
    return // Game has ended, don't continue to day phase
  }
  
  // Start day phase after a brief delay
  setTimeout(() => {
    startDayPhase(room, roomId)
  }, 3000) // 3 second delay to show night results
}

// Helper function to start day phase
function startDayPhase(room, roomId) {
  console.log(`Starting day phase in room ${roomId}`)
  
  // Change game state to day phase
  room.gameState = GAME_STATES.DAY_PHASE
  room.currentPhase = PHASES.DAY
  
  // Reset accusations for new day
  room.accusations.clear()
  
  // Notify all clients that day phase is starting
  io.to(roomId).emit(SOCKET_EVENTS.START_DAY_PHASE, { 
    roomId: roomId,
    alivePlayers: room.players.filter(player => room.alivePlayers.has(player.id))
  })
  
  console.log(`Day phase started in room ${roomId}`)
}

// Helper function to broadcast accusation updates
function broadcastAccusations(room, roomId) {
  const accusationData = {}
  
  // Build accusation data: { accusedId: { name: "PlayerName", accusers: ["AccuserName1", "AccuserName2"] } }
  room.accusations.forEach((accusers, accusedId) => {
    const accusedPlayer = room.players.find(p => p.id === accusedId)
    const accuserNames = Array.from(accusers).map(accuserId => {
      const accuserPlayer = room.players.find(p => p.id === accuserId)
      return accuserPlayer?.name || 'Unknown'
    })
    
    accusationData[accusedId] = {
      name: accusedPlayer?.name || 'Unknown',
      accusers: accuserNames,
      voteCount: accusers.size
    }
  })
  
  // Send to all clients in the room
  io.to(roomId).emit(SOCKET_EVENTS.ACCUSATIONS_UPDATE, { accusations: accusationData })
}

// Helper function to check for majority vote
function checkMajorityVote(room) {
  const aliveCount = room.alivePlayers.size
  const majorityThreshold = Math.floor(aliveCount / 2) + 1
  
  // Find player with majority votes
  for (const [accusedId, accusers] of room.accusations) {
    if (accusers.size >= majorityThreshold) {
      return accusedId
    }
  }
  
  return null
}

// Helper function to start elimination countdown
function startEliminationCountdown(room, targetId, roomId) {
  const targetPlayer = room.players.find(p => p.id === targetId)
  console.log(`Starting elimination countdown for ${targetPlayer?.name} in room ${roomId}`)
  
  // Notify all clients about the countdown
  io.to(roomId).emit(SOCKET_EVENTS.ELIMINATION_COUNTDOWN, {
    targetId,
    targetName: targetPlayer?.name,
    duration: GAME_CONFIG.ELIMINATION_COUNTDOWN_TIME
  })
  
  // Start countdown timer
  room.eliminationCountdown = setTimeout(() => {
    eliminatePlayer(room, targetId, roomId)
  }, GAME_CONFIG.ELIMINATION_COUNTDOWN_TIME)
}

// Helper function to eliminate a player
function eliminatePlayer(room, playerId, roomId) {
  const eliminatedPlayer = room.players.find(p => p.id === playerId)
  const eliminatedRole = room.playerRoles.get(playerId)
  
  if (!eliminatedPlayer) {
    console.error(`Could not find player to eliminate: ${playerId}`)
    return
  }
  
  // Remove from alive players
  room.alivePlayers.delete(playerId)
  
  console.log(`${eliminatedPlayer.name} (${eliminatedRole?.name}) was eliminated in room ${roomId}`)
  
  // Notify all clients about the elimination
  io.to(roomId).emit(SOCKET_EVENTS.PLAYER_ELIMINATED, {
    eliminatedPlayer: {
      id: playerId,
      name: eliminatedPlayer.name,
      role: eliminatedRole
    },
    roomId: roomId
  })
  
  // Clear elimination countdown
  room.eliminationCountdown = null
  
  // Reset accusations
  room.accusations.clear()
  
  // Check for win conditions after elimination
  const gameEnded = checkWinConditions(room, roomId)
  if (gameEnded) {
    return // Game has ended, don't continue to next night phase
  }
  
  // Start the next night phase after a delay
  setTimeout(() => {
    startNextNightPhase(room, roomId)
  }, 5000) // 5 second delay to show elimination results
}

// Helper function to start next night phase
function startNextNightPhase(room, roomId) {
  console.log(`Starting next night phase in room ${roomId}`)
  
  // Change game state back to night phase
  room.gameState = GAME_STATES.NIGHT_PHASE
  room.currentPhase = PHASES.NIGHT
  
  // Reset night phase data
  room.mafiaVotes.clear()
  room.healedPlayerId = null
  room.seerInvestigatedPlayerId = null
  room.mafiaVotesLocked = false
  
  // Notify all players that night phase is starting
  io.to(roomId).emit(SOCKET_EVENTS.START_NIGHT_PHASE, { roomId: roomId })
  console.log(`Next night phase started in room ${roomId}`)
  
  // Begin night actions for remaining alive players
  try {
    const mafiaPlayers = getMafiaPlayers(room)
    const doctorPlayers = getDoctorPlayers(room, roomId)
    const seerPlayers = getSeerPlayers(room, roomId)
    const allAlivePlayers = room.players.filter(player => room.alivePlayers.has(player.id))
    const aliveNonMafiaPlayers = getAliveNonMafiaPlayers(room)
    
    console.log(`Next night - Alive: ${allAlivePlayers.length}, Mafia: ${mafiaPlayers.length}, Doctor: ${doctorPlayers.length}, Seer: ${seerPlayers.length}`)
    
    // Send actions to each role type
    mafiaPlayers.forEach(mafiaPlayer => {
      const mafiaSocket = io.sockets.sockets.get(mafiaPlayer.id)
      if (mafiaSocket) {
        mafiaSocket.emit(SOCKET_EVENTS.BEGIN_MAFIA_VOTE, {
          targets: aliveNonMafiaPlayers.map(player => ({ id: player.id, name: player.name }))
        })
      }
    })
    
    doctorPlayers.forEach(doctorPlayer => {
      const doctorSocket = io.sockets.sockets.get(doctorPlayer.id)
      if (doctorSocket) {
        doctorSocket.emit(SOCKET_EVENTS.BEGIN_DOCTOR_ACTION, {
          targets: allAlivePlayers.map(player => ({ id: player.id, name: player.name }))
        })
      }
    })
    
    seerPlayers.forEach(seerPlayer => {
      const seerSocket = io.sockets.sockets.get(seerPlayer.id)
      if (seerSocket) {
        // Filter out the Seer themselves from investigation targets
        const investigationTargets = allAlivePlayers.filter(player => player.id !== seerPlayer.id)
        seerSocket.emit(SOCKET_EVENTS.BEGIN_SEER_ACTION, {
          targets: investigationTargets.map(player => ({
            id: player.id,
            name: player.name
          }))
        })
      }
    })
    
    // Broadcast initial empty vote state to all Mafia
    broadcastMafiaVotes(room)
    
  } catch (error) {
    console.error(`ERROR in next night phase setup for room ${roomId}:`, error)
  }
}

// Helper function to check win conditions
function checkWinConditions(room, roomId) {
  const alivePlayers = room.players.filter(player => room.alivePlayers.has(player.id))
  const aliveRoles = alivePlayers.map(player => room.playerRoles.get(player.id))
  
  const aliveMafia = aliveRoles.filter(role => role.alignment === 'evil').length
  const aliveGood = aliveRoles.filter(role => role.alignment === 'good').length
  
  console.log(`Win condition check: ${aliveMafia} mafia, ${aliveGood} good players alive`)
  
  let winner = null
  let winCondition = null
  
  // Mafia wins if they equal or outnumber good players
  if (aliveMafia >= aliveGood && aliveMafia > 0) {
    winner = 'mafia'
    winCondition = 'Mafia has achieved parity or superiority'
  }
  // Good wins if all mafia are eliminated
  else if (aliveMafia === 0) {
    winner = 'villagers'
    winCondition = 'All mafia members have been eliminated'
  }
  
  if (winner) {
    // Game has ended!
    room.gameState = GAME_STATES.ENDED
    
    const gameEndData = {
      winner,
      winCondition,
      alivePlayers: alivePlayers.map(player => ({
        id: player.id,
        name: player.name,
        role: room.playerRoles.get(player.id)
      })),
      allPlayers: room.players.map(player => ({
        id: player.id,
        name: player.name,
        role: room.playerRoles.get(player.id),
        alive: room.alivePlayers.has(player.id)
      })),
      roomId: roomId
    }
    
    // Send game end event to all players
    io.to(roomId).emit(SOCKET_EVENTS.GAME_END, gameEndData)
    
    console.log(`Game ended in room ${roomId}: ${winner} wins - ${winCondition}`)
    return true // Game has ended
  }
  
  return false // Game continues
}

// Helper function to start consensus timer
function startConsensusTimer(room, roomId) {
  // Clear existing timer
  if (room.voteConsensusTimer) {
    clearTimeout(room.voteConsensusTimer)
  }
  
  room.voteConsensusTimer = setTimeout(() => {
    const consensusTarget = checkMafiaVoteConsensus(room)
    if (consensusTarget) {
      console.log(`Mafia consensus reached in room ${roomId}: targeting ${consensusTarget}`)
      
      // Lock the votes so they can't be changed
      room.mafiaVotesLocked = true
      
      // Notify all Mafia that votes are now locked
      const mafiaPlayers = getMafiaPlayers(room)
      mafiaPlayers.forEach(mafiaPlayer => {
        const mafiaSocket = io.sockets.sockets.get(mafiaPlayer.id)
        if (mafiaSocket) {
          mafiaSocket.emit(SOCKET_EVENTS.MAFIA_VOTES_LOCKED)
        }
      })
      
      // Clear the timer (action is now complete)
      room.voteConsensusTimer = null
      
      // Check if night phase is complete
      checkNightCompletion(room, roomId)
    }
  }, GAME_CONFIG.MAFIA_VOTE_CONSENSUS_TIME)
}

// Helper function to broadcast player updates to room
function broadcastPlayersUpdate(roomId) {
  const room = getRoom(roomId)
  const now = Date.now()
  
  // Add disconnection info to players
  const playersWithConnectionInfo = room.players.map(player => {
    const connectionData = playerConnections.get(player.id)
    let disconnectionInfo = null
    
    if (!player.connected && connectionData && connectionData.disconnectedAt) {
      const disconnectedFor = now - connectionData.disconnectedAt
      const timeLeft = Math.max(0, CONNECTION_CONFIG.RECONNECT_GRACE_PERIOD - disconnectedFor)
      
      disconnectionInfo = {
        disconnectedFor: Math.floor(disconnectedFor / 1000),
        timeLeft: Math.floor(timeLeft / 1000),
        hasExpired: timeLeft <= 0
      }
    }
    
    return {
      ...player,
      disconnectionInfo: disconnectionInfo
    }
  })
  
  const updateData = {
    players: playersWithConnectionInfo,
    canStart: room.players.length >= GAME_CONFIG.MIN_PLAYERS && room.gameState === GAME_STATES.LOBBY
  }
  
  io.to(roomId).emit(SOCKET_EVENTS.PLAYERS_UPDATE, updateData)
}

// Helper function to broadcast readiness updates to host
function broadcastReadinessUpdate(roomId) {
  const room = getRoom(roomId)
  const now = Date.now()
  
  const readinessData = room.players.map(player => {
    const connectionData = playerConnections.get(player.id)
    let disconnectionInfo = null
    
    if (!player.connected && connectionData && connectionData.disconnectedAt) {
      const disconnectedFor = now - connectionData.disconnectedAt
      const timeLeft = Math.max(0, CONNECTION_CONFIG.RECONNECT_GRACE_PERIOD - disconnectedFor)
      
      disconnectionInfo = {
        disconnectedFor: Math.floor(disconnectedFor / 1000),
        timeLeft: Math.floor(timeLeft / 1000),
        hasExpired: timeLeft <= 0
      }
    }
    
    return {
      id: player.id,
      name: player.name,
      ready: room.playerReadiness.get(player.id) || false,
      connected: player.connected,
      disconnectionInfo: disconnectionInfo
    }
  })
  
  // Send to host only
  const hostSocket = io.sockets.sockets.get(room.host)
  if (hostSocket) {
    hostSocket.emit(SOCKET_EVENTS.READINESS_UPDATE, { players: readinessData })
  }
}

// ===================== CONNECTION MANAGEMENT SYSTEM =====================

function initializePlayerConnection(playerId, roomId, playerName) {
  playerConnections.set(playerId, {
    lastHeartbeat: Date.now(),
    reconnectTimer: null,
    roomId,
    playerName
  })
}

function updatePlayerConnection(playerId, isConnected) {
  const room = getRoom(playerConnections.get(playerId)?.roomId)
  if (!room) return

  const player = room.players.find(p => p.id === playerId)
  if (!player) return

  const wasConnected = player.connected
  player.connected = isConnected

  if (isConnected) {
    // Clear any existing reconnect timer
    const connection = playerConnections.get(playerId)
    if (connection?.reconnectTimer) {
      clearTimeout(connection.reconnectTimer)
      connection.reconnectTimer = null
    }
    connection.lastHeartbeat = Date.now()
  } else if (!isConnected && wasConnected) {
    // Start reconnect timer
    const connection = playerConnections.get(playerId)
    if (connection) {
      connection.reconnectTimer = setTimeout(() => {
        handlePlayerTimeout(playerId)
      }, CONNECTION_CONFIG.RECONNECT_TIMEOUT)
    }
  }

  // Update game state based on connection changes
  checkGameStateAfterConnectionChange(room.id)
}

function handlePlayerTimeout(playerId) {
  const connection = playerConnections.get(playerId)
  if (!connection) return

  const room = getRoom(connection.roomId)
  if (!room) return

  const player = room.players.find(p => p.id === playerId)
  if (!player) return

  console.log(`Player ${player.name} (${playerId}) timed out after ${CONNECTION_CONFIG.RECONNECT_TIMEOUT}ms`)
  
  // Remove player from game if in lobby
  if (room.gameState === GAME_STATES.LOBBY) {
    removePlayerFromGame(room, playerId, room.id)
  } else {
    // In active game, mark as permanently disconnected
    player.connected = false
    player.timedOut = true
    
    // Notify other players
    io.to(room.id).emit(SOCKET_EVENTS.PLAYER_DISCONNECTED, {
      playerId,
      playerName: player.name,
      permanent: true
    })
    
    // Check if game should end due to disconnections
    checkGameStateAfterConnectionChange(room.id)
  }
}

function isPlayerConnectionAlive(playerId) {
  const connection = playerConnections.get(playerId)
  if (!connection) return false

  const timeSinceLastHeartbeat = Date.now() - connection.lastHeartbeat
  return timeSinceLastHeartbeat < CONNECTION_CONFIG.HEARTBEAT_TIMEOUT
}

function getConnectedPlayerPercentage(roomId) {
  const room = getRoom(roomId)
  if (!room) return 0

  const totalPlayers = room.players.length
  if (totalPlayers === 0) return 0

  const connectedPlayers = room.players.filter(p => p.connected).length
  return connectedPlayers / totalPlayers
}

function checkGameStateAfterConnectionChange(roomId) {
  const room = getRoom(roomId)
  if (!room) return

  const connectedPercentage = getConnectedPlayerPercentage(roomId)
  const shouldPause = connectedPercentage < CONNECTION_CONFIG.MIN_CONNECTED_PERCENTAGE

  // Don't pause if game hasn't started or has ended
  if (room.gameState === GAME_STATES.LOBBY || room.gameState === GAME_STATES.ENDED) {
    return
  }

  if (shouldPause && !room.gamePaused) {
    pauseGame(roomId, `Game paused: ${Math.round(connectedPercentage * 100)}% of players connected`)
  } else if (!shouldPause && room.gamePaused) {
    resumeGame(roomId)
  }
}

function pauseGame(roomId, reason) {
  const room = getRoom(roomId)
  if (!room || room.gamePaused) return

  room.gamePaused = true
  room.pauseReason = reason

  const connectedPlayers = room.players.filter(p => p.connected).length
  const totalPlayers = room.players.length

  io.to(roomId).emit(SOCKET_EVENTS.GAME_PAUSED, {
    reason,
    connectedPlayers,
    totalPlayers
  })

  console.log(`Game paused in room ${roomId}: ${reason}`)
}

function resumeGame(roomId) {
  const room = getRoom(roomId)
  if (!room || !room.gamePaused) return

  room.gamePaused = false
  room.pauseReason = null

  io.to(roomId).emit(SOCKET_EVENTS.GAME_RESUMED)
  console.log(`Game resumed in room ${roomId}`)
}

function startHeartbeatSystem() {
  // Send heartbeats to all connected clients
  setInterval(() => {
    io.emit(SOCKET_EVENTS.HEARTBEAT)
  }, CONNECTION_CONFIG.HEARTBEAT_INTERVAL)

  // Check for expired connections
  setInterval(cleanupExpiredConnections, CONNECTION_CONFIG.CLEANUP_INTERVAL)
}

function cleanupExpiredConnections() {
  const now = Date.now()
  
  for (const [playerId, connection] of playerConnections.entries()) {
    const timeSinceLastHeartbeat = now - connection.lastHeartbeat
    
    if (timeSinceLastHeartbeat >= CONNECTION_CONFIG.HEARTBEAT_TIMEOUT) {
      console.log(`No heartbeat from player ${playerId} for ${timeSinceLastHeartbeat}ms`)
      updatePlayerConnection(playerId, false)
    }
  }
}

// ===================== END CONNECTION MANAGEMENT =====================

io.on('connection', (socket) => {
  console.log('New connection:', socket.id)

  // Host creates/joins a room
  socket.on('host-room', (data) => {
    const { roomId, requestGameState } = data
    const room = getRoom(roomId)
    
    console.log(`=== HOST ROOM EVENT ===`)
    console.log('Data received:', { roomId, requestGameState })
    console.log('Current room state:', {
      gameState: room.gameState,
      playerCount: room.players.length,
      hasGameType: roomGameTypes.has(roomId)
    })
    
    // Clear any existing host disconnect timeout (host reconnected in time)
    if (room.hostDisconnectTimeout) {
      console.log(`Host reconnected to room ${roomId} within grace period - clearing timeout`)
      clearTimeout(room.hostDisconnectTimeout)
      room.hostDisconnectTimeout = null
      
      // Resume game if it was paused for host disconnect
      if (room.gameState !== GAME_STATES.LOBBY && room.gameState !== GAME_STATES.ENDED) {
        room.gamePaused = false
        room.pauseReason = null
        io.to(roomId).emit(SOCKET_EVENTS.GAME_RESUMED)
        console.log(`Game resumed after host reconnection in room ${roomId}`)
      }
    }
    
    // Set this socket as the host
    room.host = socket.id
    socket.join(roomId)
    socket.roomId = roomId
    socket.isHost = true
    
    console.log(`Host ${socket.id} created/joined room ${roomId}`)
    
    // Send full game state to reconnecting host
    if (requestGameState) {
      console.log('Preparing full game state for reconnecting host')
      
      // Helper function to convert Map to array of entries
      const mapToArray = (map) => {
        if (!map) return null;
        return Array.from(map.entries());
      };

      // Helper function to convert Set to array
      const setToArray = (set) => {
        if (!set) return null;
        return Array.from(set);
      };

      const gameState = {
        gameState: room.gameState,
        players: room.players,
        gameType: roomGameTypes.get(roomId),
        playerReadiness: room.gameState === GAME_STATES.ROLE_ASSIGNMENT ? 
          room.players.map(player => ({
            id: player.id,
            name: player.name,
            ready: room.playerReadiness.get(player.id) || false,
            connected: player.connected
          })) : null,
        eliminatedPlayer: room.gameState === GAME_STATES.NIGHT_PHASE ? room.eliminatedPlayer : null,
        savedPlayer: room.gameState === GAME_STATES.NIGHT_PHASE ? room.savedPlayer : null,
        accusations: room.gameState === GAME_STATES.DAY_PHASE ? 
          mapToArray(room.accusations).map(([key, value]) => [key, setToArray(value)]) : null,
        eliminationCountdown: room.gameState === GAME_STATES.DAY_PHASE ? room.eliminationCountdown : null,
        dayEliminatedPlayer: room.gameState === GAME_STATES.DAY_PHASE ? room.dayEliminatedPlayer : null,
        gameEndData: room.gameState === GAME_STATES.ENDED ? {
          winner: room.winner,
          winCondition: room.winCondition,
          alivePlayers: setToArray(room.alivePlayers),
          allPlayers: room.players.map(player => ({
            id: player.id,
            name: player.name,
            role: room.playerRoles.get(player.id),
            alive: room.alivePlayers.has(player.id)
          }))
        } : null
      }
      console.log('Sending game state to host:', JSON.stringify(gameState))
      socket.emit(SOCKET_EVENTS.RESTORE_GAME_STATE, gameState)
    } else {
      // Send current game type
      const gameType = roomGameTypes.get(roomId)
      if (gameType) {
        socket.emit(SOCKET_EVENTS.GAME_TYPE_SELECTED, gameType)
      }
    }

    // Send current player list
    broadcastPlayersUpdate(roomId)

    // If game is paused, send pause state
    if (room.gamePaused) {
      socket.emit(SOCKET_EVENTS.GAME_PAUSED, {
        reason: room.pauseReason,
        connectedPlayers: room.players.filter(p => p.connected).length,
        totalPlayers: room.players.length
      })
    }
    
    console.log('=== HOST ROOM EVENT COMPLETE ===')
  })

  // Host selects game type
  socket.on(SOCKET_EVENTS.SELECT_GAME_TYPE, (data) => {
    const { roomId, gameType } = data
    
    if (!socket.isHost) {
      socket.emit('error', { message: 'Only host can select game type' })
      return
    }

    const room = getRoom(roomId)
    
    if (room.gameState !== GAME_STATES.LOBBY) {
      socket.emit('error', { message: 'Can only select game type in lobby' })
      return
    }

    // Store the game type for this room
    roomGameTypes.set(roomId, gameType)
    
    console.log(`Host selected game type ${gameType} for room ${roomId}`)
    
    // Confirm to host
    socket.emit(SOCKET_EVENTS.GAME_TYPE_SELECTED, gameType)
  })

  // Get room info (game type and available images)
  socket.on(SOCKET_EVENTS.GET_ROOM_INFO, (data) => {
    const { roomId } = data

    // Validate room exists
    if (!gameRooms.has(roomId)) {
      socket.emit('error', { message: 'Room not found' })
      return
    }

    const room = getRoom(roomId)
    const gameType = roomGameTypes.get(roomId) || GAME_TYPES.WEREWOLF
    const availableImages = PROFILE_IMAGES[gameType]
    const defaultImage = availableImages[Math.floor(Math.random() * availableImages.length)]

    socket.emit(SOCKET_EVENTS.ROOM_INFO, {
      roomId,
      gameType,
      availableImages,
      defaultImage
    })
  })

  // Player joins a room
  socket.on(SOCKET_EVENTS.PLAYER_JOIN, (data) => {
    const { playerName, roomId, profileImage } = data

    // Validate room exists
    if (!gameRooms.has(roomId)) {
      socket.emit('error', { message: 'Room not found' })
      return
    }

    const room = getRoom(roomId)

    // Validate player name
    if (!validatePlayerName(playerName)) {
      socket.emit('error', { message: 'Invalid player name' })
      return
    }

    // Check if player already exists
    const existingPlayer = room.players.find(p => p.name.toLowerCase() === playerName.toLowerCase())
    if (existingPlayer) {
      socket.emit('error', { message: 'Player name already taken' })
      return
    }

    // Check max players
    if (room.players.length >= GAME_CONFIG.MAX_PLAYERS) {
      socket.emit('error', { message: 'Room is full' })
      return
    }

    // Check if game already started
    if (room.gameState !== GAME_STATES.LOBBY) {
      socket.emit('error', { message: 'Game already in progress' })
      return
    }

    // Add player to room
    const gameType = roomGameTypes.get(roomId) || GAME_TYPES.WEREWOLF
    const availableImages = PROFILE_IMAGES[gameType]
    
    // Validate profile image
    if (!profileImage || !availableImages.includes(profileImage)) {
      socket.emit('error', { message: 'Invalid profile image' })
      return
    }
    
    const newPlayer = {
      id: socket.id,
      name: playerName.trim(),
      connected: true,
      profileImage: profileImage,
      profileImageSelected: true
    }

    room.players.push(newPlayer)
    socket.join(roomId)
    socket.roomId = roomId
    socket.playerName = playerName.trim()
    socket.isHost = false

    // Initialize connection tracking
    const reconnectToken = initializePlayerConnection(socket.id, roomId, playerName.trim())

    console.log(`Player ${playerName} joined room ${roomId}`)

    // Confirm join to the player with reconnect token
    socket.emit(SOCKET_EVENTS.PLAYER_JOINED, { 
      success: true, 
      playerId: socket.id,
      playerName: playerName.trim(),
      reconnectToken: reconnectToken
    })

    // Broadcast updated player list to room
    broadcastPlayersUpdate(roomId)
  })

  // Host starts the game
  socket.on(SOCKET_EVENTS.GAME_START, (data) => {
    const { roomId } = data
    
    if (!socket.isHost) {
      socket.emit('error', { message: 'Only host can start the game' })
      return
    }

    const room = getRoom(roomId)
    
    if (room.players.length < GAME_CONFIG.MIN_PLAYERS) {
      socket.emit('error', { message: `Need at least ${GAME_CONFIG.MIN_PLAYERS} players to start` })
      return
    }

    if (room.gameState !== GAME_STATES.LOBBY) {
      socket.emit('error', { message: 'Game already started' })
      return
    }

    // Change game state to role assignment
    room.gameState = GAME_STATES.ROLE_ASSIGNMENT
    
    try {
      // Assign roles to players
      const gameType = roomGameTypes.get(roomId) || 'werewolf'
      const roles = assignRoles(room.players.length, gameType)
      
      // Store role assignments and initialize readiness to false
      room.players.forEach((player, index) => {
        room.playerRoles.set(player.id, roles[index])
        room.playerReadiness.set(player.id, false)
        room.alivePlayers.add(player.id) // All players start alive
      })
      
      console.log(`Roles assigned in room ${roomId}:`)
      room.players.forEach(player => {
        const role = room.playerRoles.get(player.id)
        console.log(`  ${player.name}: ${role.name}`)
      })
      
      // Send role assignments to each player
      room.players.forEach(player => {
        const playerSocket = io.sockets.sockets.get(player.id)
        if (playerSocket) {
          const role = room.playerRoles.get(player.id)
          playerSocket.emit(SOCKET_EVENTS.ROLE_ASSIGNED, {
            role: role,
            playerName: player.name
          })
          console.log(`Sent role ${role.name} to ${player.name}`)
        } else {
          console.log(`Warning: Could not find socket for player ${player.name} (${player.id})`)
        }
      })
      
      // Send initial readiness update to host (all players start as not ready)
      broadcastReadinessUpdate(roomId)
      
    } catch (error) {
      console.error('Error assigning roles:', error)
      socket.emit('error', { message: 'Failed to assign roles' })
      // Revert game state on error
      room.gameState = GAME_STATES.LOBBY
    }
  })

  // Player confirms they're ready after seeing their role
  socket.on(SOCKET_EVENTS.PLAYER_READY, (data) => {
    if (socket.isHost) {
      socket.emit('error', { message: 'Host cannot ready up' })
      return
    }

    if (!socket.roomId) {
      socket.emit('error', { message: 'Not in a room' })
      return
    }

    const room = getRoom(socket.roomId)
    
    if (room.gameState !== GAME_STATES.ROLE_ASSIGNMENT) {
      socket.emit('error', { message: 'Not in role assignment phase' })
      return
    }

    // Set player as ready
    room.playerReadiness.set(socket.id, true)
    console.log(`Player ${socket.playerName} is ready in room ${socket.roomId}`)
    
    // Broadcast updated readiness to host
    broadcastReadinessUpdate(socket.roomId)
    
    // Check if all connected players are ready
    // During role assignment, we need ALL players (including disconnected ones) to be ready
    // Don't auto-advance for disconnected players since they haven't seen their role yet
    const allReady = room.players.every(player => {
      return room.playerReadiness.get(player.id) === true
    })
    
    // If there are disconnected players who haven't marked ready, check if they've been gone too long
    const hasDisconnectedUnreadyPlayers = room.players.some(player => {
      const isReady = room.playerReadiness.get(player.id)
      if (isReady) return false // This player is ready, not a problem
      
      if (!player.connected) {
        const connectionData = playerConnections.get(player.id)
        if (connectionData && connectionData.disconnectedAt) {
          const disconnectedFor = Date.now() - connectionData.disconnectedAt
          // If disconnected for more than 60 seconds during role assignment, end the game
          return disconnectedFor > 60000 // 60 seconds grace period for role assignment
        }
      }
      
      return false
    })
    
    // If someone has been disconnected too long during role assignment, end the game
    if (hasDisconnectedUnreadyPlayers) {
      console.log(`Ending game in room ${socket.roomId} - player disconnected too long during role assignment`)
      
      room.gameState = GAME_STATES.ENDED
      
      const gameEndData = {
        winner: null,
        winCondition: `Game ended - A player disconnected during role assignment and could not return`,
        alivePlayers: [],
        allPlayers: room.players.map(player => ({
          id: player.id,
          name: player.name,
          role: room.playerRoles.get(player.id),
          alive: false
        })),
        roomId: socket.roomId
      }
      
      io.to(socket.roomId).emit(SOCKET_EVENTS.GAME_END, gameEndData)
      return
    }
    
    if (allReady) {
      // All players are ready, start the night phase
      room.gameState = GAME_STATES.NIGHT_PHASE
      room.currentPhase = PHASES.NIGHT
      
      // Notify all players that night phase is starting
      io.to(socket.roomId).emit(SOCKET_EVENTS.START_NIGHT_PHASE, { roomId: socket.roomId })
      console.log(`All players ready, starting night phase in room ${socket.roomId}`)
      
      try {
        // Begin Mafia voting
        console.log(`=== NIGHT PHASE DEBUG START ===`)
        
        const mafiaPlayers = getMafiaPlayers(room)
        const aliveNonMafiaPlayers = getAliveNonMafiaPlayers(room)
        
        console.log(`Room ${socket.roomId} players:`, room.players.map(p => `${p.name}(${p.id})`))
        console.log(`Alive players:`, Array.from(room.alivePlayers))
        console.log(`Found ${mafiaPlayers.length} Mafia players`)
        console.log(`Found ${aliveNonMafiaPlayers.length} targets`)
        
        // Send voting options to each Mafia player
        mafiaPlayers.forEach(mafiaPlayer => {
          const mafiaSocket = io.sockets.sockets.get(mafiaPlayer.id)
          if (mafiaSocket) {
            mafiaSocket.emit(SOCKET_EVENTS.BEGIN_MAFIA_VOTE, {
              targets: aliveNonMafiaPlayers.map(player => ({
                id: player.id,
                name: player.name
              }))
            })
            console.log(`Sent voting options to Mafia ${mafiaPlayer.name}`)
          } else {
            console.log(`ERROR: Could not find socket for Mafia player ${mafiaPlayer.name} (${mafiaPlayer.id})`)
          }
        })
        
        // Broadcast initial empty vote state to all Mafia
        broadcastMafiaVotes(room)
        
        if (mafiaPlayers.length === 0) {
          console.log(`ERROR: No Mafia players found in room ${socket.roomId}!`)
        }
        
        // Begin Doctor action
        const doctorPlayers = getDoctorPlayers(room, socket.roomId)
        const allAlivePlayers = room.players.filter(player => room.alivePlayers.has(player.id))
        
        const gameType = roomGameTypes.get(socket.roomId) || GAME_TYPES.WEREWOLF
        const roleSet = ROLE_SETS[gameType]
        
        console.log(`Found ${doctorPlayers.length} ${roleSet.PROTECTOR.name} players`)
        
        doctorPlayers.forEach(doctorPlayer => {
          const doctorSocket = io.sockets.sockets.get(doctorPlayer.id)
          if (doctorSocket) {
            doctorSocket.emit(SOCKET_EVENTS.BEGIN_DOCTOR_ACTION, {
              targets: allAlivePlayers.map(player => ({
                id: player.id,
                name: player.name
              }))
            })
            console.log(`Sent healing options to ${roleSet.PROTECTOR.name} ${doctorPlayer.name}`)
          } else {
            console.log(`ERROR: Could not find socket for ${roleSet.PROTECTOR.name} player ${doctorPlayer.name} (${doctorPlayer.id})`)
          }
        })
        
        // Begin Seer/Detective action
        const seerPlayers = getSeerPlayers(room, socket.roomId)
        
        console.log(`=== DETECTIVE/SEER DEBUG ===`)
        console.log(`Game type: ${gameType}`)
        console.log(`Expected investigator name: ${roleSet.INVESTIGATOR.name}`)
        console.log(`Found ${seerPlayers.length} ${roleSet.INVESTIGATOR.name} players`)
        
        // Debug: List all players and their roles for comparison
        console.log(`All players and their roles:`)
        room.players.forEach(player => {
          const role = room.playerRoles.get(player.id)
          console.log(`  - ${player.name}: ${role?.name} (${role?.alignment})`)
        })
        
        seerPlayers.forEach(seerPlayer => {
          const seerSocket = io.sockets.sockets.get(seerPlayer.id)
          if (seerSocket) {
            // Filter out the investigator themselves from investigation targets
            const investigationTargets = allAlivePlayers.filter(player => player.id !== seerPlayer.id)
            console.log(`Sending investigation targets to ${seerPlayer.name}:`, investigationTargets.map(p => p.name))
            seerSocket.emit(SOCKET_EVENTS.BEGIN_SEER_ACTION, {
              targets: investigationTargets.map(player => ({
                id: player.id,
                name: player.name
              }))
            })
            console.log(`✓ Sent investigation options to ${roleSet.INVESTIGATOR.name} ${seerPlayer.name}`)
          } else {
            console.log(`ERROR: Could not find socket for ${roleSet.INVESTIGATOR.name} player ${seerPlayer.name} (${seerPlayer.id})`)
          }
        })
        console.log(`=== END DETECTIVE/SEER DEBUG ===`)
        
        console.log(`=== NIGHT PHASE DEBUG END ===`)
      } catch (error) {
        console.error(`ERROR in night phase setup for room ${socket.roomId}:`, error)
      }
    }
  })

  // Mafia player votes for a target
  socket.on(SOCKET_EVENTS.MAFIA_VOTE, (data) => {
    if (socket.isHost) {
      socket.emit('error', { message: 'Host cannot vote' })
      return
    }

    if (!socket.roomId) {
      socket.emit('error', { message: 'Not in a room' })
      return
    }

    const room = getRoom(socket.roomId)
    
    if (room.gameState !== GAME_STATES.NIGHT_PHASE) {
      socket.emit('error', { message: 'Not in night phase' })
      return
    }

    // Don't process actions if game is paused
    if (room.gamePaused) {
      socket.emit('error', { message: 'Game is paused - waiting for disconnected players' })
      return
    }

    // Verify player is Mafia (evil alignment)
    const playerRole = room.playerRoles.get(socket.id)
    if (playerRole?.alignment !== 'evil') {
      socket.emit('error', { message: 'Only Mafia can vote during night phase' })
      return
    }

    // Check if votes are locked
    if (room.mafiaVotesLocked) {
      socket.emit('error', { message: 'Voting is locked - consensus has been reached' })
      return
    }

    const { targetId } = data
    
    // Allow toggling vote off by voting for same target or sending null
    if (room.mafiaVotes.get(socket.id) === targetId || targetId === null) {
      room.mafiaVotes.delete(socket.id)
      console.log(`Mafia ${socket.playerName} removed their vote in room ${socket.roomId}`)
    } else {
      // Verify target is valid (alive and not Mafia) if not toggling off
      if (targetId) {
        if (!room.alivePlayers.has(targetId)) {
          socket.emit('error', { message: 'Invalid target' })
          return
        }

        const targetRole = room.playerRoles.get(targetId)
        if (targetRole?.alignment === 'evil') {
          socket.emit('error', { message: 'Cannot target fellow Mafia' })
          return
        }
      }

      // Record the vote
      if (targetId) {
        room.mafiaVotes.set(socket.id, targetId)
        const targetPlayer = room.players.find(p => p.id === targetId)
        console.log(`Mafia ${socket.playerName} voted to eliminate ${targetPlayer?.name} in room ${socket.roomId}`)
      }
    }

    // Broadcast current vote state to all Mafia
    broadcastMafiaVotes(room)

    // Clear any existing timer
    if (room.voteConsensusTimer) {
      clearTimeout(room.voteConsensusTimer)
      room.voteConsensusTimer = null
      
      // Notify Mafia that consensus was broken
      const mafiaPlayers = getMafiaPlayers(room)
      mafiaPlayers.forEach(mafiaPlayer => {
        const mafiaSocket = io.sockets.sockets.get(mafiaPlayer.id)
        if (mafiaSocket) {
          mafiaSocket.emit(SOCKET_EVENTS.CONSENSUS_TIMER_CANCELLED)
        }
      })
    }

    // Check for consensus and start timer if all votes agree
    const consensusTarget = checkMafiaVoteConsensus(room)
    if (consensusTarget) {
      const targetPlayer = room.players.find(p => p.id === consensusTarget)
      console.log(`Mafia consensus forming in room ${socket.roomId} for target ${targetPlayer?.name}`)
      
      // Notify all Mafia that consensus timer is starting
      const mafiaPlayers = getMafiaPlayers(room)
      mafiaPlayers.forEach(mafiaPlayer => {
        const mafiaSocket = io.sockets.sockets.get(mafiaPlayer.id)
        if (mafiaSocket) {
          mafiaSocket.emit(SOCKET_EVENTS.CONSENSUS_TIMER_START, {
            targetId: consensusTarget,
            targetName: targetPlayer?.name,
            duration: GAME_CONFIG.MAFIA_VOTE_CONSENSUS_TIME
          })
        }
      })
      
      startConsensusTimer(room, socket.roomId)
    }
  })

  // Doctor player heals a target
  socket.on(SOCKET_EVENTS.DOCTOR_HEAL, (data) => {
    if (socket.isHost) {
      socket.emit('error', { message: 'Host cannot heal' })
      return
    }

    if (!socket.roomId) {
      socket.emit('error', { message: 'Not in a room' })
      return
    }

    const room = getRoom(socket.roomId)
    
    if (room.gameState !== GAME_STATES.NIGHT_PHASE) {
      socket.emit('error', { message: 'Not in night phase' })
      return
    }

    // Don't process actions if game is paused
    if (room.gamePaused) {
      socket.emit('error', { message: 'Game is paused - waiting for disconnected players' })
      return
    }

    // Verify player is Doctor/Healer (protector role)
    const gameType = roomGameTypes.get(socket.roomId) || GAME_TYPES.WEREWOLF
    const roleSet = ROLE_SETS[gameType]
    const playerRole = room.playerRoles.get(socket.id)
    if (playerRole?.name !== roleSet.PROTECTOR.name) {
      const protectorName = roleSet.PROTECTOR.name
      socket.emit('error', { message: `Only ${protectorName} can heal during night phase` })
      return
    }

    const { targetId } = data
    
    // Verify target is valid (alive player)
    if (!room.alivePlayers.has(targetId)) {
      socket.emit('error', { message: 'Invalid heal target' })
      return
    }

    // Store the heal target
    room.healedPlayerId = targetId
    const targetPlayer = room.players.find(p => p.id === targetId)
    console.log(`${roleSet.PROTECTOR.name} ${socket.playerName} chose to heal ${targetPlayer?.name} in room ${socket.roomId}`)
    
    // Check if both Mafia and Doctor actions are complete
    checkNightCompletion(room, socket.roomId)
  })

  // Seer player investigates a target
  socket.on(SOCKET_EVENTS.SEER_INVESTIGATE, (data) => {
    console.log(`=== INVESTIGATION ATTEMPT DEBUG ===`)
    console.log(`Player ${socket.playerName} (${socket.id}) attempting to investigate`)
    console.log(`Room: ${socket.roomId}`)
    
    if (socket.isHost) {
      socket.emit('error', { message: 'Host cannot investigate' })
      console.log(`ERROR: Host tried to investigate`)
      return
    }

    if (!socket.roomId) {
      socket.emit('error', { message: 'Not in a room' })
      console.log(`ERROR: Player not in room`)
      return
    }

    const room = getRoom(socket.roomId)
    
    if (room.gameState !== GAME_STATES.NIGHT_PHASE) {
      socket.emit('error', { message: 'Not in night phase' })
      console.log(`ERROR: Not in night phase, current state: ${room.gameState}`)
      return
    }

    // Don't process actions if game is paused
    if (room.gamePaused) {
      socket.emit('error', { message: 'Game is paused - waiting for disconnected players' })
      console.log(`ERROR: Game is paused`)
      return
    }

    // Verify player is Seer/Detective (investigator role)
    const gameType = roomGameTypes.get(socket.roomId) || GAME_TYPES.WEREWOLF
    const roleSet = ROLE_SETS[gameType]
    const playerRole = room.playerRoles.get(socket.id)
    
    console.log(`Game type: ${gameType}`)
    console.log(`Expected investigator role: ${roleSet.INVESTIGATOR.name}`)
    console.log(`Player's actual role: ${playerRole?.name}`)
    console.log(`Role alignment: ${playerRole?.alignment}`)
    
    if (playerRole?.name !== roleSet.INVESTIGATOR.name) {
      const investigatorName = roleSet.INVESTIGATOR.name
      console.log(`ERROR: Role mismatch - expected ${investigatorName}, got ${playerRole?.name}`)
      socket.emit('error', { message: `Only ${investigatorName} can investigate during night phase` })
      return
    }
    
    console.log(`✓ Role verification passed for ${roleSet.INVESTIGATOR.name}`)
    console.log(`=== END INVESTIGATION DEBUG ===`)

    const { targetId } = data
    
    // Verify target is valid (alive player)
    if (!room.alivePlayers.has(targetId)) {
      socket.emit('error', { message: 'Invalid investigation target' })
      return
    }

    // Store the investigation target
    room.seerInvestigatedPlayerId = targetId
    const targetPlayer = room.players.find(p => p.id === targetId)
    const targetRole = room.playerRoles.get(targetId)
    
    console.log(`${roleSet.INVESTIGATOR.name} ${socket.playerName} investigated ${targetPlayer?.name} in room ${socket.roomId}`)
    
    // Determine investigation result based on alignment
    let resultMessage
    if (targetRole?.alignment === 'evil') {
      resultMessage = `${targetPlayer?.name} appears to be aligned with evil.`
    } else {
      resultMessage = `${targetPlayer?.name} appears innocent... for now.`
    }
    
    // Send result back to investigator
    socket.emit(SOCKET_EVENTS.SEER_RESULT, {
      targetName: targetPlayer?.name,
      result: resultMessage
    })
    
    console.log(`Sent investigation result to ${roleSet.INVESTIGATOR.name} ${socket.playerName}: ${resultMessage}`)
    
    // Check if all night actions are complete
    checkNightCompletion(room, socket.roomId)
  })

  // Player makes an accusation during day phase
  socket.on(SOCKET_EVENTS.PLAYER_ACCUSE, (data) => {
    if (socket.isHost) {
      socket.emit('error', { message: 'Host cannot vote' })
      return
    }

    if (!socket.roomId) {
      socket.emit('error', { message: 'Not in a room' })
      return
    }

    const room = getRoom(socket.roomId)
    
    if (room.gameState !== GAME_STATES.DAY_PHASE) {
      socket.emit('error', { message: 'Not in day phase' })
      return
    }

    // Verify player is alive
    if (!room.alivePlayers.has(socket.id)) {
      socket.emit('error', { message: 'Dead players cannot vote' })
      return
    }

    const { targetId } = data
    
    // Clear any existing accusation by this player
    room.accusations.forEach((accusers, accusedId) => {
      accusers.delete(socket.id)
      if (accusers.size === 0) {
        room.accusations.delete(accusedId)
      }
    })
    
    // If targetId is provided and valid, add the new accusation
    if (targetId) {
      // Verify target is valid (alive player, not self)
      if (!room.alivePlayers.has(targetId)) {
        socket.emit('error', { message: 'Invalid accusation target' })
        return
      }
      
      if (targetId === socket.id) {
        socket.emit('error', { message: 'Cannot accuse yourself' })
        return
      }
      
      // Add the accusation
      if (!room.accusations.has(targetId)) {
        room.accusations.set(targetId, new Set())
      }
      room.accusations.get(targetId).add(socket.id)
      
      const targetPlayer = room.players.find(p => p.id === targetId)
      console.log(`${socket.playerName} accused ${targetPlayer?.name} in room ${socket.roomId}`)
    } else {
      console.log(`${socket.playerName} cleared their accusation in room ${socket.roomId}`)
    }
    
    // Broadcast updated accusations
    broadcastAccusations(room, socket.roomId)
    
    // Clear any existing elimination countdown
    if (room.eliminationCountdown) {
      clearTimeout(room.eliminationCountdown)
      room.eliminationCountdown = null
      io.to(socket.roomId).emit(SOCKET_EVENTS.COUNTDOWN_CANCELLED)
      console.log(`Elimination countdown cancelled in room ${socket.roomId}`)
    }
    
    // Check for majority vote
    const majorityTarget = checkMajorityVote(room)
    if (majorityTarget) {
      startEliminationCountdown(room, majorityTarget, socket.roomId)
    }
  })

  // ===================== CONNECTION MANAGEMENT HANDLERS =====================
  
  // Handle heartbeat responses
  socket.on(SOCKET_EVENTS.HEARTBEAT_RESPONSE, () => {
    const playerId = socket.id
    const connection = playerConnections.get(playerId)
    if (connection) {
      connection.lastHeartbeat = Date.now()
    }
  })
  
  // Handle player reconnection attempts
  socket.on(SOCKET_EVENTS.PLAYER_RECONNECT, (data) => {
    const { reconnectToken, roomId } = data
    
    console.log(`Reconnection attempt: token=${reconnectToken?.substring(0, 8)}..., roomId=${roomId}`)
    
    // Validate reconnect token
    const tokenData = reconnectTokens.get(reconnectToken)
    if (!tokenData || tokenData.roomId !== roomId) {
      console.log(`Invalid reconnect token: tokenData=${!!tokenData}, roomMatch=${tokenData?.roomId === roomId}`)
      socket.emit('error', { message: 'Invalid reconnect token - please refresh and rejoin' })
      return
    }
    
    const room = getRoom(roomId)
    const player = room.players.find(p => p.id === tokenData.playerId)
    
    if (!player) {
      console.log(`Player not found: playerId=${tokenData.playerId}, players in room=${room.players.map(p => p.id)}`)
      socket.emit('error', { message: 'Player not found in room - please refresh and rejoin' })
      return
    }
    
    console.log(`Reconnecting player ${player.name} (${tokenData.playerId} -> ${socket.id}) in room ${roomId}, current game state: ${room.gameState}`)
    
    // Update socket connection
    const oldSocketId = tokenData.playerId
    const newSocketId = socket.id
    
    // Update player ID to new socket ID
    player.id = newSocketId
    
    // Update room data structures
    if (room.playerRoles.has(oldSocketId)) {
      room.playerRoles.set(newSocketId, room.playerRoles.get(oldSocketId))
      room.playerRoles.delete(oldSocketId)
    }
    if (room.playerReadiness.has(oldSocketId)) {
      room.playerReadiness.set(newSocketId, room.playerReadiness.get(oldSocketId))
      room.playerReadiness.delete(oldSocketId)
    }
    if (room.alivePlayers.has(oldSocketId)) {
      room.alivePlayers.delete(oldSocketId)
      room.alivePlayers.add(newSocketId)
    }
    if (room.mafiaVotes.has(oldSocketId)) {
      room.mafiaVotes.set(newSocketId, room.mafiaVotes.get(oldSocketId))
      room.mafiaVotes.delete(oldSocketId)
    }
    
    // Update accusations
    room.accusations.forEach((accusers, accusedId) => {
      if (accusers.has(oldSocketId)) {
        accusers.delete(oldSocketId)
        accusers.add(newSocketId)
      }
    })
    if (room.accusations.has(oldSocketId)) {
      room.accusations.set(newSocketId, room.accusations.get(oldSocketId))
      room.accusations.delete(oldSocketId)
    }
    
    // Update connection tracking
    const connectionData = playerConnections.get(oldSocketId)
    if (connectionData) {
      playerConnections.delete(oldSocketId)
      playerConnections.set(newSocketId, {
        ...connectionData,
        lastHeartbeat: Date.now(),
        disconnectedAt: null
      })
      
      // Update reconnect token mapping
      reconnectTokens.set(reconnectToken, {
        ...tokenData,
        playerId: newSocketId
      })
    }
    
    // Update socket properties
    socket.join(roomId)
    socket.roomId = roomId
    socket.playerName = player.name
    socket.isHost = false
    
    // Mark as connected
    updatePlayerConnection(newSocketId, true)
    
    console.log(`Player ${player.name} reconnected to room ${roomId} (${oldSocketId} -> ${newSocketId})`)
    
    // Send reconnection success with current game state
    const gameState = {
      gameState: room.gameState,
      playerId: newSocketId,
      playerName: player.name,
      isEliminated: !room.alivePlayers.has(newSocketId),
      reconnectToken: reconnectToken
    }
    
    // Add role information if game is active
    if (room.gameState !== GAME_STATES.LOBBY) {
      gameState.role = room.playerRoles.get(newSocketId)
    }
    
    console.log(`Sending reconnection data to ${player.name}:`, gameState)
    socket.emit(SOCKET_EVENTS.PLAYER_RECONNECTED, gameState)
    
    // Send current game state data based on phase
    if (room.gameState === GAME_STATES.ROLE_ASSIGNMENT) {
      // For role assignment, send the role information again
      const role = room.playerRoles.get(newSocketId)
      if (role) {
        socket.emit(SOCKET_EVENTS.ROLE_ASSIGNED, {
          role: role,
          playerName: player.name
        })
        console.log(`Re-sent role ${role.name} to reconnected player ${player.name}`)
      }
      
      // Send current readiness state to the reconnecting player
      const isReady = room.playerReadiness.get(newSocketId) || false
      socket.emit('readiness-state', { isReady })
      console.log(`Restored readiness state for ${player.name}: ${isReady}`)
      
      broadcastReadinessUpdate(roomId)
    } else if (room.gameState === GAME_STATES.NIGHT_PHASE) {
      // Send appropriate night phase data
      const role = room.playerRoles.get(newSocketId)
      if (role?.alignment === 'evil') {
        const aliveNonMafiaPlayers = getAliveNonMafiaPlayers(room)
        socket.emit(SOCKET_EVENTS.BEGIN_MAFIA_VOTE, {
          targets: aliveNonMafiaPlayers.map(p => ({ id: p.id, name: p.name }))
        })
        broadcastMafiaVotes(room)
      } else if (role?.name === 'Doctor' || role?.name === 'Protector') {
        const allAlivePlayers = room.players.filter(p => room.alivePlayers.has(p.id))
        socket.emit(SOCKET_EVENTS.BEGIN_DOCTOR_ACTION, {
          targets: allAlivePlayers.map(p => ({ id: p.id, name: p.name }))
        })
      } else if (role?.name === 'Seer' || role?.name === 'Investigator') {
        const allAlivePlayers = room.players.filter(p => room.alivePlayers.has(p.id) && p.id !== newSocketId)
        socket.emit(SOCKET_EVENTS.BEGIN_SEER_ACTION, {
          targets: allAlivePlayers.map(p => ({ id: p.id, name: p.name }))
        })
      }
    } else if (room.gameState === GAME_STATES.DAY_PHASE) {
      const alivePlayers = room.players.filter(p => room.alivePlayers.has(p.id))
      socket.emit(SOCKET_EVENTS.START_DAY_PHASE, { alivePlayers })
      broadcastAccusations(room, roomId)
    }
    
    // Send game paused status if applicable
    if (room.gamePaused) {
      socket.emit(SOCKET_EVENTS.GAME_PAUSED, {
        reason: room.pauseReason,
        connectedPlayers: room.players.filter(p => p.connected).length,
        totalPlayers: room.players.length
      })
    }
  })
  
  // Host requests updated readiness data (for live timer updates)
  socket.on('request-readiness-update', (data) => {
    if (!socket.isHost) {
      return // Only hosts can request this
    }
    
    const { roomId } = data
    if (roomId) {
      broadcastReadinessUpdate(roomId)
    }
  })

  // Host requests updated player data (for live timer updates during gameplay)
  socket.on('request-player-update', (data) => {
    if (!socket.isHost) {
      return // Only hosts can request this
    }
    
    const { roomId } = data
    if (roomId) {
      broadcastPlayersUpdate(roomId)
    }
  })

  // ===================== END CONNECTION MANAGEMENT HANDLERS =====================

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`Client disconnected: ${socket.id}, reason: ${reason}`)
    
    if (socket.roomId) {
      const room = getRoom(socket.roomId)
      
      if (socket.isHost) {
        // Host disconnected - give grace period before ending game
        console.log(`Host disconnected from room ${socket.roomId} - starting ${CONNECTION_CONFIG.RECONNECT_TIMEOUT/1000}s grace period`)
        
        if (room.gameState !== GAME_STATES.LOBBY && room.gameState !== GAME_STATES.ENDED) {
          // Set a timeout to end the game if host doesn't reconnect
          room.hostDisconnectTimeout = setTimeout(() => {
            console.log(`Host grace period expired - ending game in room ${socket.roomId}`)
            room.gameState = GAME_STATES.ENDED
            io.to(socket.roomId).emit(SOCKET_EVENTS.GAME_END, {
              winner: null,
              winCondition: 'Game ended - Host disconnected',
              roomId: socket.roomId
            })
            room.hostDisconnectTimeout = null
          }, CONNECTION_CONFIG.RECONNECT_TIMEOUT)
          
          // Notify players that host disconnected
          io.to(socket.roomId).emit(SOCKET_EVENTS.GAME_PAUSED, {
            reason: 'Host disconnected',
            connectedPlayers: room.players.filter(p => p.connected).length,
            totalPlayers: room.players.length,
            reconnectTimeLeft: CONNECTION_CONFIG.RECONNECT_TIMEOUT
          })
        }
      } else if (socket.playerName) {
        // Player disconnected - mark as disconnected but don't remove immediately
        const player = room.players.find(p => p.id === socket.id)
        if (player) {
          console.log(`Player ${player.name} disconnected from room ${socket.roomId}`)
          updatePlayerConnection(socket.id, false)
          
          // Notify other players about the disconnection
          io.to(socket.roomId).emit(SOCKET_EVENTS.PLAYER_DISCONNECTED, {
            playerId: socket.id,
            playerName: player.name,
            reconnectTimeLeft: CONNECTION_CONFIG.RECONNECT_TIMEOUT
          })
        }
      }
    }
  })
}) 