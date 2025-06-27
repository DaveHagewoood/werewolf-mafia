import { Server } from 'socket.io'
import { createServer } from 'http'
import { 
  SOCKET_EVENTS, 
  validatePlayerName, 
  GAME_CONFIG, 
  GAME_STATES, 
  PHASES, 
  ROLES, 
  ROLE_SETS, 
  GAME_TYPES, 
  PROFILE_IMAGES, 
  getProfileImageUrl, 
  assignRoles, 
  CONNECTION_CONFIG
} from '@werewolf-mafia/shared'
const httpServer = createServer()
const port = process.env.PORT || 3002

// Configure CORS for both development and production
const allowedOrigins = [
  // Development URLs (LOCAL TESTING MODE)
  "https://werewolf-mafia-host.onrender.com", // Host Dev URL
  "https://werewolf-mafia-player.onrender.com", // Player Dev URL
  // Production URLs (Render.com) - DISABLED FOR LOCAL TESTING
  // "https://werewolf-mafia-host.onrender.com",
  // "https://werewolf-mafia-player.onrender.com"
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
  }
})


// Store game rooms in memory (simplified for relay server)
const gameRooms = new Map()

// Store game types for each room
const roomGameTypes = new Map()

// Store player connection data
const playerConnections = new Map() // playerId -> { lastHeartbeat, reconnectTimer }

// Store reconnect tokens for player reconnection
const reconnectTokens = new Map() // token -> { playerId, roomId, playerName, createdAt }

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

// Helper function to get or create room (simplified for relay server)
function getRoom(roomId) {
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
  return checkMafiaVoteConsensusWithVotes(room.mafiaVotes, room)
}

// Helper function to check Mafia vote consensus with specific votes
function checkMafiaVoteConsensusWithVotes(mafiaVotes, room) {
  const mafiaPlayers = getMafiaPlayers(room)
  const votes = Array.from(mafiaVotes.values())
  
  // Need all mafia to vote
  if (mafiaVotes.size !== mafiaPlayers.length) {
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
  
  // Clear any previous day elimination data
  room.dayEliminatedPlayer = null
  
  // Notify all clients that day phase is starting (legacy event)
  io.to(roomId).emit(SOCKET_EVENTS.START_DAY_PHASE, { 
    roomId: roomId,
    alivePlayers: room.players.filter(player => room.alivePlayers.has(player.id))
  })
  
  // NOTE: Removed broadcastMasterGameState - host will broadcast state in pure host-authoritative model
  
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

// NOTE: Removed broadcastMasterGameState() function - pure host-authoritative architecture
// Host now broadcasts state directly to players via HostGameStateManager

// Helper function to format accusations for client compatibility
function formatAccusationsForClients(room) {
  const accusationData = {};
  
  if (!room.accusations) return accusationData;
  
  // Convert Map format to object format expected by clients
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
  
  // Store countdown data for enhanced state
  const countdownDuration = Math.floor(GAME_CONFIG.ELIMINATION_COUNTDOWN_TIME / 1000) // Convert to seconds
  room.eliminationCountdown = {
    targetId,
    targetName: targetPlayer?.name,
    timeLeft: countdownDuration,
    startTime: Date.now()
  }
  
  // Notify all clients about the countdown (legacy event)
  io.to(roomId).emit(SOCKET_EVENTS.ELIMINATION_COUNTDOWN, {
    targetId,
    targetName: targetPlayer?.name,
    duration: GAME_CONFIG.ELIMINATION_COUNTDOWN_TIME
  })
  
  // NOTE: Removed broadcastMasterGameState - host will broadcast state in pure host-authoritative model
  
  // Start countdown timer with periodic updates
  const countdownInterval = setInterval(() => {
    if (!room.eliminationCountdown) {
      clearInterval(countdownInterval)
      return
    }
    
    const elapsed = Math.floor((Date.now() - room.eliminationCountdown.startTime) / 1000)
    const remaining = Math.max(0, countdownDuration - elapsed)
    
    room.eliminationCountdown.timeLeft = remaining
    
    if (remaining <= 0) {
      clearInterval(countdownInterval)
      eliminatePlayer(room, targetId, roomId)
    } else {
      // NOTE: Removed broadcastMasterGameState - host will broadcast state in pure host-authoritative model
    }
  }, 1000)
  
  // Store interval reference for cleanup
  room.eliminationCountdownInterval = countdownInterval
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
  
  // Store elimination data for enhanced state
  room.dayEliminatedPlayer = {
    id: playerId,
    name: eliminatedPlayer.name,
    role: eliminatedRole
  }
  
  // Notify all clients about the elimination (legacy event)
  io.to(roomId).emit(SOCKET_EVENTS.PLAYER_ELIMINATED, {
    eliminatedPlayer: {
      id: playerId,
      name: eliminatedPlayer.name,
      role: eliminatedRole
    },
    roomId: roomId
  })
  
  // Clear elimination countdown and interval
  if (room.eliminationCountdownInterval) {
    clearInterval(room.eliminationCountdownInterval)
    room.eliminationCountdownInterval = null
  }
  room.eliminationCountdown = null
  
  // Reset accusations
  room.accusations.clear()
  
  // NOTE: Removed broadcastMasterGameState - host will broadcast state in pure host-authoritative model
  
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
  
  // Clear previous night's elimination results for new night phase
  room.eliminatedPlayer = null
  room.savedPlayer = null
  
  console.log(`Next night phase started in room ${roomId}`)
  
  // NOTE: Removed broadcastMasterGameState - host will broadcast state in pure host-authoritative model
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
// NOTE: In pure host-authoritative architecture, server doesn't manage readiness state
function broadcastReadinessUpdate(roomId) {
  const room = getRoom(roomId)
  if (!room) return
  
  console.log(`⚠️ WARNING: broadcastReadinessUpdate called but server doesn't manage readiness state in pure host-authoritative architecture`)
  console.log(`Room ${roomId} - This should be handled by the host`)
  
  // In pure host-authoritative architecture, the server doesn't have playerReadiness
  // The host manages all readiness state and broadcasts it directly
  // This function should not be called, but we're keeping it safe to prevent crashes
  
  // Just notify the host that something changed, but don't try to access readiness data
  const hostSocket = io.sockets.sockets.get(room.host)
  if (hostSocket) {
    console.log(`Notifying host that players may have changed for room ${roomId}`)
    // The host should handle its own readiness updates
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
  const connection = playerConnections.get(playerId);
  if (!connection) return;

  const room = getRoom(connection.roomId);
  if (!room) return;

  const player = room.players.find(p => p.id === playerId);
  if (!player) return;

  // If connecting, always update connection status
  if (isConnected) {
    player.connected = true;
    // Clear any existing reconnect timer
    if (connection.reconnectTimer) {
      clearTimeout(connection.reconnectTimer);
      connection.reconnectTimer = null;
    }
    connection.lastHeartbeat = Date.now();
    
    // Notify host of player reconnection for any non-lobby, non-ended phase
    if (room.gameState !== GAME_STATES.LOBBY && room.gameState !== GAME_STATES.ENDED) {
      // For active game phases, notify host of reconnection
      const hostSocket = io.sockets.sockets.get(room.host);
      if (hostSocket) {
        hostSocket.emit('player-action', {
          type: 'PLAYER_RECONNECT',
          playerId: playerId,
          playerName: player.name,
          data: { 
            reason: 'active_game_reconnect',
            gameState: room.gameState
          }
        });
      }
    }
    return;
  }

  // Handle disconnection based on game state
  if (room.gameState === GAME_STATES.LOBBY) {
    // In lobby: player should already be removed, this is just cleanup
    playerConnections.delete(playerId);
    return;
  }

  // Active game phase disconnection
  player.connected = false;
  connection.disconnectedAt = Date.now();
  
  // Start reconnect timer
  connection.reconnectTimer = setTimeout(() => {
    handlePlayerTimeout(playerId);
  }, CONNECTION_CONFIG.RECONNECT_TIMEOUT);

  // NOTE: Removed broadcastReadinessUpdate() - host now controls readiness state in pure host-authoritative architecture
  // NOTE: Removed checkGameStateAfterConnectionChange() - host now controls pause/resume in pure host-authoritative architecture
}

function handlePlayerTimeout(playerId) {
  const connection = playerConnections.get(playerId);
  if (!connection) return;

  const room = getRoom(connection.roomId);
  if (!room) return;

  const player = room.players.find(p => p.id === playerId);
  if (!player) return;

  console.log(`Player ${player.name} (${playerId}) timed out after ${CONNECTION_CONFIG.RECONNECT_TIMEOUT}ms`);
  
  // In lobby, player should have already been removed by updatePlayerConnection
  if (room.gameState === GAME_STATES.LOBBY) {
    console.log(`Unexpected timeout in lobby for ${player.name} - removing if still present`);
    removePlayerFromGame(room, playerId, room.id);
    return;
  }
  
  // For active game phases, mark as permanently disconnected
  player.connected = false;
  player.timedOut = true;
  
  // Notify other players
  io.to(room.id).emit(SOCKET_EVENTS.PLAYER_DISCONNECTED, {
    playerId,
    playerName: player.name,
    permanent: true
  });
  
  // NOTE: Removed checkGameStateAfterConnectionChange() - host now controls pause/resume decisions
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

// Helper function to remove a player from the game
function removePlayerFromGame(room, playerId, roomId) {
  // Remove from players array
  room.players = room.players.filter(p => p.id !== playerId);
  
  // Clean up any player data - safely handle undefined properties (lobby rooms don't have all game state)
  if (room.playerReadiness) {
    room.playerReadiness.delete(playerId);
  }
  if (room.playerRoles) {
    room.playerRoles.delete(playerId);
  }
  if (room.alivePlayers) {
    room.alivePlayers.delete(playerId);
  }
  if (room.mafiaVotes) {
    room.mafiaVotes.delete(playerId);
  }
  
  // Clean up accusations - safely handle undefined
  if (room.accusations) {
    room.accusations.delete(playerId);
    room.accusations.forEach(accusers => {
      accusers.delete(playerId);
    });
  }
  
  // Clean up connection tracking
  playerConnections.delete(playerId);
  
  // Broadcast updated player list
  broadcastPlayersUpdate(roomId);
  
  console.log(`Player ${playerId} removed from room ${roomId}`);
}

io.on('connection', (socket) => {
  console.log('New connection:', socket.id)

  // Host creates/joins a room
  socket.on('host-room', (data) => {
    const { roomId, requestGameState } = data
    let room = getRoom(roomId)
    
    // Create room if it doesn't exist
    if (!room) {
      console.log(`Creating new room ${roomId}`)
      room = {
        id: roomId,
        host: null,
        players: [],
        createdAt: Date.now(),
        gameState: GAME_STATES.LOBBY
      }
      gameRooms.set(roomId, room)
    }
    
    // Set this socket as the host
    room.host = socket.id
    socket.join(roomId)
    socket.roomId = roomId
    socket.isHost = true
    
    console.log(`Host ${socket.id} created/joined room ${roomId}`)
    
    // Send current game type if available
    const gameType = roomGameTypes.get(roomId)
    if (gameType) {
      socket.emit(SOCKET_EVENTS.GAME_TYPE_SELECTED, gameType)
    }
  })

  // HOST RELAY HANDLERS - for host-authoritative architecture
  
  // Host broadcasting state to players
  socket.on('host-broadcast-state', (data) => {
    const { roomId, gameState } = data
    console.log(`Host broadcasting state for room ${roomId}`)
    
    if (!socket.isHost) {
      socket.emit('error', { message: 'Only host can broadcast state' })
      return
    }
    
    // Relay state to PLAYERS ONLY (not host) - pure host-authoritative architecture
    const room = getRoom(roomId)
    if (room) {
      room.players.forEach(player => {
        const playerSocket = io.sockets.sockets.get(player.id)
        if (playerSocket && playerSocket.id !== socket.id) { // Don't send to host
          playerSocket.emit('game-state-update', gameState)
        }
      })
    }
  })

  // Host syncing critical game state for proper disconnect handling
  socket.on('host-sync-game-phase', (data) => {
    const { roomId, gamePhase, players } = data
    console.log(`Host syncing game phase for room ${roomId}: ${gamePhase}`)
    
    if (!socket.isHost) {
      socket.emit('error', { message: 'Only host can sync game state' })
      return
    }
    
    // Update server's room state with critical info for disconnect handling
    const room = getRoom(roomId)
    if (room) {
      room.gameState = gamePhase
      console.log(`✅ Server updated room ${roomId} state to: ${gamePhase}`)
    }
  })

  // Host sending individual message to specific player
  socket.on('host-send-to-player', (data) => {
    const { roomId, playerId, event, data: eventData } = data
    console.log(`Host sending ${event} to player ${playerId} in room ${roomId}`)
    
    if (!socket.isHost) {
      socket.emit('error', { message: 'Only host can send to players' })
      return
    }
    
    // Find player socket and send event
    const playerSocket = io.sockets.sockets.get(playerId)
    if (playerSocket && playerSocket.roomId === roomId) {
      playerSocket.emit(event, eventData)
    } else {
      console.log(`Player ${playerId} not found or not in room ${roomId}`)
    }
  })

  // PLAYER ACTION RELAY HANDLERS - forward actions to host instead of processing

  // Forward Mafia votes to host
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
    if (!room) {
      socket.emit('error', { message: 'Room not found' })
      return
    }

    // Forward action to host
    const hostSocket = io.sockets.sockets.get(room.host)
    if (hostSocket) {
      hostSocket.emit('player-action', {
        type: 'MAFIA_VOTE',
        playerId: socket.id,
        playerName: socket.playerName,
        data: data
      })
    }
  })

  // Forward Doctor heals to host
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
    if (!room) {
      socket.emit('error', { message: 'Room not found' })
      return
    }

    // Forward action to host
    const hostSocket = io.sockets.sockets.get(room.host)
    if (hostSocket) {
      hostSocket.emit('player-action', {
        type: 'DOCTOR_HEAL',
        playerId: socket.id,
        playerName: socket.playerName,
        data: data
      })
    }
  })

  // Forward Seer investigations to host
  socket.on(SOCKET_EVENTS.SEER_INVESTIGATE, (data) => {
    if (socket.isHost) {
      socket.emit('error', { message: 'Host cannot investigate' })
      return
    }

    if (!socket.roomId) {
      socket.emit('error', { message: 'Not in a room' })
      return
    }

    const room = getRoom(socket.roomId)
    if (!room) {
      socket.emit('error', { message: 'Room not found' })
      return
    }

    // Forward action to host
    const hostSocket = io.sockets.sockets.get(room.host)
    if (hostSocket) {
      hostSocket.emit('player-action', {
        type: 'SEER_INVESTIGATE',
        playerId: socket.id,
        playerName: socket.playerName,
        data: data
      })
    }
  })

  // Forward Day Phase Voting/Accusations to host (RELAY ARCHITECTURE)
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
    if (!room) {
      socket.emit('error', { message: 'Room not found' })
      return
    }

    // Forward action to host - let host handle all game logic
    const hostSocket = io.sockets.sockets.get(room.host)
    if (hostSocket) {
      hostSocket.emit('player-action', {
        type: 'PLAYER_ACCUSE',
        playerId: socket.id,
        playerName: socket.playerName,
        data: data
      })
    }
  })

  // Forward Player Ready to host
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
    if (!room) {
      socket.emit('error', { message: 'Room not found' })
      return
    }

    // Forward action to host
    const hostSocket = io.sockets.sockets.get(room.host)
    if (hostSocket) {
      hostSocket.emit('player-action', {
        type: 'PLAYER_READY',
        playerId: socket.id,
        playerName: socket.playerName,
        data: data
      })
    }
  })

  // Host selects game type
  socket.on(SOCKET_EVENTS.SELECT_GAME_TYPE, (data) => {
    const { roomId, gameType } = data
    
    if (!socket.isHost) {
      socket.emit('error', { message: 'Only host can select game type' })
      return
    }

    // Store the game type for this room (relay server only stores this for room info)
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

    // IMMUTABLE PLAYER LIST RULE: Once game starts, no new players can join
    if (room.gameState !== GAME_STATES.LOBBY) {
      console.log(`🚫 Game in progress (${room.gameState}) - checking if ${playerName} can reconnect`)
      
      // Find existing player with exact name match
      const existingPlayer = room.players.find(p => p.name.toLowerCase() === playerName.toLowerCase())
      
      if (!existingPlayer) {
        // NEW PLAYER attempting to join active game - REJECT
        console.log(`❌ New player "${playerName}" attempted to join active game - REJECTED`)
        socket.emit('error', { 
          message: 'Game already in progress. Only existing players can reconnect.',
          gameInProgress: true
        })
        return
      }
      
      // EXISTING PLAYER found - check if they're actually disconnected
      console.log(`   Player "${playerName}" connection status: connected=${existingPlayer.connected}`)
      if (existingPlayer.connected !== false) {
        // Player is currently connected - REJECT takeover attempt
        console.log(`❌ Player "${playerName}" is already connected - REJECTING takeover attempt`)
        socket.emit('error', { 
          message: 'That player is already connected to the game.',
          playerAlreadyConnected: true
        })
        return
      }
      
      // DISCONNECTED PLAYER attempting to reconnect - ALLOW
      console.log(`✅ Disconnected player "${playerName}" attempting to reconnect (was disconnected: ${existingPlayer.connected === false})`)
      
      // Generate a reconnect token for this existing disconnected player
      const reconnectToken = `reconnect_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      reconnectTokens.set(reconnectToken, {
        playerId: existingPlayer.id,
        playerName: playerName.trim(),
        roomId: roomId,
        createdAt: Date.now(),
        expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes
      })
      
      // Clean up expired tokens
      setTimeout(() => {
        reconnectTokens.delete(reconnectToken)
        console.log(`🧹 Cleaned up expired reconnect token for ${playerName}`)
      }, 5 * 60 * 1000)
      
      console.log(`Generated reconnect token for ${playerName}: ${reconnectToken.substring(0, 16)}...`)
      
      // Send reconnect token to player so they can use PLAYER_RECONNECT flow
      socket.emit(SOCKET_EVENTS.PLAYER_JOINED, {
        success: true,
        playerId: existingPlayer.id,
        playerName: playerName.trim(),
        reconnectToken: reconnectToken,
        isReconnection: true
      })
      return
    }
    
    // LOBBY STATE: Check for name collisions in lobby
    const existingPlayer = room.players.find(p => p.name.toLowerCase() === playerName.toLowerCase())
    if (existingPlayer) {
      // In lobby, name collision is an error
      socket.emit('error', { message: 'Player name already taken' })
      return
    }

    // Check max players
    if (room.players.length >= GAME_CONFIG.MAX_PLAYERS) {
      socket.emit('error', { message: 'Room is full' })
      return
    }

    // Add player to room (simplified for relay server)
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

    // Add player to simple room structure
    room.players.push(newPlayer)
    
    socket.join(roomId)
    socket.roomId = roomId
    socket.playerName = playerName.trim()
    socket.isHost = false

    // Initialize connection tracking
    initializePlayerConnection(socket.id, roomId, playerName.trim())

    console.log(`Player ${playerName} joined room ${roomId}`);

    // Confirm join to the player (no reconnect token needed for new joins)
    socket.emit(SOCKET_EVENTS.PLAYER_JOINED, { 
      success: true, 
      playerId: socket.id,
      playerName: playerName.trim()
    })

    // Forward player join to host for host-authoritative architecture
    const hostSocket = io.sockets.sockets.get(room.host)
    if (hostSocket) {
      hostSocket.emit('player-action', {
        type: 'PLAYER_JOIN',
        playerId: socket.id,
        playerName: playerName.trim(),
        data: {
          profileImage: profileImage
        }
      })
    }
  })

  // Host starts the game - validate and send confirmation
  socket.on(SOCKET_EVENTS.GAME_START, (data) => {
    const { roomId } = data
    
    if (!socket.isHost) {
      socket.emit('error', { message: 'Only host can start the game' })
      return
    }

    const room = getRoom(roomId)
    if (!room) {
      socket.emit('error', { message: 'Room not found' })
      return
    }
    
    if (room.players.length < GAME_CONFIG.MIN_PLAYERS) {
      socket.emit('error', { message: `Need at least ${GAME_CONFIG.MIN_PLAYERS} players to start` })
      return
    }

    console.log(`Host requesting game start for room ${roomId} with ${room.players.length} players`)

    // Send confirmation back to host - host will handle the actual game start logic
    socket.emit('host-action-confirmed', {
      type: 'GAME_START',
      data: data
    })
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
  
  // Handle player reconnection attempts (token-based)
  socket.on(SOCKET_EVENTS.PLAYER_RECONNECT, (data) => {
    const { reconnectToken, roomId } = data
    
    console.log(`🔄 Reconnection attempt: token=${reconnectToken?.substring(0, 8)}..., roomId=${roomId}`)
    
    // Validate reconnect token
    const tokenData = reconnectTokens.get(reconnectToken)
    if (!tokenData || tokenData.roomId !== roomId || Date.now() > tokenData.expiresAt) {
      console.log(`❌ Invalid/expired reconnect token: tokenData=${!!tokenData}, roomMatch=${tokenData?.roomId === roomId}, expired=${tokenData ? Date.now() > tokenData.expiresAt : 'N/A'}`)
      // Clean up expired token
      if (tokenData && Date.now() > tokenData.expiresAt) {
        reconnectTokens.delete(reconnectToken)
      }
      socket.emit('error', { message: 'That name belongs to someone else or they already reconnected' })
      return
    }
    
    const room = getRoom(roomId)
    const player = room.players.find(p => p.id === tokenData.playerId)
    
    if (!player) {
      console.log(`❌ Player not found: playerId=${tokenData.playerId}`)
      socket.emit('error', { message: 'That name belongs to someone else or they already reconnected' })
      return
    }
    
    console.log(`✅ Reconnecting player ${player.name} (${tokenData.playerId} -> ${socket.id})`)
    
    // Update socket connection
    const oldSocketId = tokenData.playerId
    const newSocketId = socket.id
    
    // Update player ID to new socket ID
    player.id = newSocketId
    
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
    
    console.log(`🎉 Player ${player.name} reconnected successfully: ${oldSocketId} -> ${newSocketId}`)
    
    // Send reconnection success
    socket.emit(SOCKET_EVENTS.PLAYER_RECONNECTED, {
      success: true,
      playerId: newSocketId,
      playerName: player.name,
      reconnectToken: reconnectToken,
      message: 'Reconnected successfully - receiving game state from host...'
    })
    
    // Notify host of the reconnection so it can send proper state
    const hostSocket = io.sockets.sockets.get(room.host)
    if (hostSocket && room.gameState !== GAME_STATES.LOBBY) {
      hostSocket.emit('player-action', {
        type: 'PLAYER_RECONNECT',
        playerId: newSocketId,
        playerName: player.name,
        data: { 
          reason: 'active_game_reconnect',
          gameState: room.gameState,
          oldPlayerId: oldSocketId,
          newPlayerId: newSocketId
        }
      })
    }
  })
  
  // Host requests updated readiness data (for live timer updates)
  // NOTE: Removed in pure host-authoritative architecture - host manages its own readiness state
  socket.on('request-readiness-update', (data) => {
    if (!socket.isHost) {
      return // Only hosts can request this
    }
    
    console.log(`⚠️ WARNING: request-readiness-update called but server doesn't manage readiness in pure host-authoritative architecture`)
    console.log(`Host should manage its own readiness state and updates`)
    
    // In pure host-authoritative architecture, the host manages all readiness state
    // The server doesn't need to broadcast readiness updates
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
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Get the room for this socket
    if (!socket.roomId) {
      console.log('Socket disconnected but was not in a room');
      return;
    }
    
    const room = getRoom(socket.roomId);
    if (!room) {
      console.log(`Socket disconnected but room ${socket.roomId} not found`);
      return;
    }
    
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      console.log(`Player ${player.name} disconnected from room ${socket.roomId}`);
      
      // Check if this is a lobby disconnection or game-phase disconnection
      if (room.gameState === GAME_STATES.LOBBY) {
        // In lobby: forward disconnection to host for pure host-authoritative architecture
        console.log(`Lobby disconnection - notifying host about ${player.name}`);
        
        // Forward disconnection to host as player action
        const hostSocket = io.sockets.sockets.get(room.host);
        if (hostSocket) {
          hostSocket.emit('player-action', {
            type: 'PLAYER_DISCONNECT',
            playerId: socket.id,
            playerName: player.name,
            data: { reason: 'lobby_disconnect' }
          });
        }
        
        // Remove from server's room structure (but let host handle state updates)
        room.players = room.players.filter(p => p.id !== socket.id);
        playerConnections.delete(socket.id);
      } else {
        // For active game phases, forward disconnection to host for pure host-authoritative architecture
        console.log(`Game-phase disconnection for ${player.name} - notifying host`);
        
        // Forward disconnection to host as player action
        const hostSocket = io.sockets.sockets.get(room.host);
        if (hostSocket) {
          hostSocket.emit('player-action', {
            type: 'PLAYER_DISCONNECT',
            playerId: socket.id,
            playerName: player.name,
            data: { 
              reason: 'active_game_disconnect',
              gameState: room.gameState
            }
          });
        }
        
        // Mark player as disconnected in server's room structure
        player.connected = false;
        console.log(`🔌 Marked ${player.name} as disconnected in server room structure`);
        
        // Update connection status but let host handle pause decisions
        updatePlayerConnection(socket.id, false);
      }
    } else {
      console.log(`Disconnected client ${socket.id} was not found in room ${socket.roomId} players`);
    }
  });
}) 

// Helper function to start night phase - removed for relay server
// Night phase is now started by the host in host-authoritative architecture 
