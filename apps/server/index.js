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
  }
})

// Store game rooms in memory (simplified for relay server)
const gameRooms = new Map()

// Store game types for each room
const roomGameTypes = new Map()

// Store player connection data
const playerConnections = new Map() // playerId -> { lastHeartbeat, reconnectTimer }

// Store reconnect tokens for player reconnection
const reconnectTokens = new Map() // token -> { playerId, roomId, playerName, expiry }

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
  
  // Broadcast comprehensive enhanced state for day phase
  broadcastMasterGameState(room, roomId)
  
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

// NEW: Helper function to broadcast comprehensive master game state
function broadcastMasterGameState(room, roomId) {
  // Generate comprehensive master state (similar to GameStateManager logic)
  const masterState = {
    gameState: room.gameState,
    gameType: roomGameTypes.get(roomId),
    gamePaused: room.gamePaused || false,
    pauseReason: room.pauseReason || null,
    
    // Enhanced players with comprehensive info
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
        } else if ((role.name === 'Doctor' || role.name === 'Healer') && hasHealed) {
          actionStatus = 'COMPLETED'; 
          hasActed = true;
        } else if ((role.name === 'Seer' || role.name === 'Detective') && hasInvestigated) {
          actionStatus = 'COMPLETED';
          hasActed = true;
        }
      }
      
      // Day phase accusations
      let hasAccused = false;
      if (room.gameState === GAME_STATES.DAY_PHASE) {
        room.accusations.forEach((accusers) => {
          if (accusers.has(p.id)) {
            hasAccused = true;
          }
        });
      }
      
      return {
        id: p.id,
        name: p.name,
        connected: p.connected,
        role: role,
        isReady: room.playerReadiness ? room.playerReadiness.get(p.id) || false : false,
        alive: isAlive,
        disconnectionInfo: p.disconnectionInfo || null,
        
        // Enhanced action status information
        actionStatus: actionStatus,
        hasActed: hasActed || hasAccused,
        
        // Role-specific capability flags
        canVote: isAlive && room.gameState === GAME_STATES.DAY_PHASE,
        canHeal: isAlive && room.gameState === GAME_STATES.NIGHT_PHASE && 
                role && (role.name === 'Doctor' || role.name === 'Healer') && !hasHealed,
        canInvestigate: isAlive && room.gameState === GAME_STATES.NIGHT_PHASE && 
                       role && (role.name === 'Seer' || role.name === 'Detective') && !hasInvestigated,
        canMafiaVote: isAlive && room.gameState === GAME_STATES.NIGHT_PHASE && 
                     role && role.alignment === 'evil' && !hasVoted,
        
        // Individual action status
        isHealed: room.healActions && Array.from(room.healActions.values()).includes(p.id),
        investigationResult: room.investigationResults && room.investigationResults.get(p.id) || null
      };
    }),
    
    // Phase-specific data
    eliminatedPlayer: room.eliminatedPlayer || null,
    savedPlayer: room.savedPlayer || null,
    dayEliminatedPlayer: room.dayEliminatedPlayer || null,
    accusations: formatAccusationsForClients(room),
    eliminationCountdown: room.eliminationCountdown ? {
      targetId: room.eliminationCountdown.targetId,
      targetName: room.eliminationCountdown.targetName,
      timeLeft: room.eliminationCountdown.timeLeft
    } : null,
    winner: room.winner || null,
    winCondition: room.winCondition || null,
    
    // Night phase actions
    mafiaVotes: room.mafiaVotes ? Array.from(room.mafiaVotes.entries()) : [],
    mafiaVotesLocked: room.mafiaVotesLocked || false,
    consensusTimer: room.consensusTimer || null,
    healActions: room.healActions ? Array.from(room.healActions.entries()) : [],
    investigationActions: room.investigationActions ? Array.from(room.investigationActions.entries()) : [],
    investigationResults: room.investigationResults ? Array.from(room.investigationResults.entries()) : []
  };

  console.log(`Broadcasting master game state to room ${roomId}`);
  
  // Send comprehensive state to all clients
  io.to(roomId).emit('game-state-update', masterState);
}

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
  
  // Broadcast enhanced state with countdown info
  broadcastMasterGameState(room, roomId)
  
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
      // Broadcast updated countdown every second
      broadcastMasterGameState(room, roomId)
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
  
  // Broadcast enhanced state with elimination result
  broadcastMasterGameState(room, roomId)
  
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
  
  console.log(`Next night phase started in room ${roomId}`)
  
  // All night phase data is now sent via master state updates
  // No need for individual events - players get everything they need from the master state
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

  // Update game state for active phases
  checkGameStateAfterConnectionChange(room.id);
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
  
  // Check if game should end due to disconnections
  checkGameStateAfterConnectionChange(room.id);
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
  
  // Clean up any player data
  room.playerReadiness.delete(playerId);
  room.playerRoles.delete(playerId);
  room.alivePlayers.delete(playerId);
  room.mafiaVotes.delete(playerId);
  
  // Clean up accusations
  room.accusations.delete(playerId);
  room.accusations.forEach(accusers => {
    accusers.delete(playerId);
  });
  
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
        createdAt: Date.now()
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
    
    // Relay state to ALL sockets in the room (including the host for UI updates)
    io.to(roomId).emit('game-state-update', gameState)
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

  // Handle Day Phase Voting/Accusations (ENHANCED STATE INTEGRATION - FIXED)
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

    if (room.gameState !== GAME_STATES.DAY_PHASE) {
      socket.emit('error', { message: 'Can only vote during day phase' })
      return
    }

    const playerId = socket.id
    const { targetId } = data

    // Check if player is alive
    if (!room.alivePlayers.has(playerId)) {
      socket.emit('error', { message: 'Dead players cannot vote' })
      return
    }

    // Handle vote logic
    if (targetId === null) {
      // Remove accusation
      room.accusations.forEach((accusers, accusedId) => {
        accusers.delete(playerId)
        if (accusers.size === 0) {
          room.accusations.delete(accusedId)
        }
      })
    } else {
      // Validate target
      if (!room.alivePlayers.has(targetId)) {
        socket.emit('error', { message: 'Cannot vote for dead or non-existent player' })
        return
      }

      // Remove any existing accusation by this player
      room.accusations.forEach((accusers, accusedId) => {
        accusers.delete(playerId)
        if (accusers.size === 0) {
          room.accusations.delete(accusedId)
        }
      })

      // Add new accusation
      if (!room.accusations.has(targetId)) {
        room.accusations.set(targetId, new Set())
      }
      room.accusations.get(targetId).add(playerId)
    }

    // CRITICAL FIX: Broadcast enhanced state updates immediately
    broadcastAccusations(room, socket.roomId);
    
    // ENHANCED STATE FIX: Also broadcast master game state to all clients  
    broadcastMasterGameState(room, socket.roomId);

    // Check for majority vote
    const majorityTarget = checkMajorityVote(room)
    if (majorityTarget) {
      startEliminationCountdown(room, majorityTarget, socket.roomId)
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

    // Check if player already exists - HANDLE REFRESH DURING ACTIVE GAME
    const existingPlayer = room.players.find(p => p.name.toLowerCase() === playerName.toLowerCase())
    
    // If game is active and player exists, this is likely a refresh - restore their state
    if (existingPlayer && room.gameState !== GAME_STATES.LOBBY) {
      console.log(`Player ${playerName} rejoining active game in room ${roomId} - restoring state`)
      
      // Update the existing player's socket ID and connection
      const oldSocketId = existingPlayer.id
      existingPlayer.id = socket.id
      existingPlayer.connected = true
      
      // Update all game state references from old socket ID to new socket ID
      if (room.playerRoles.has(oldSocketId)) {
        room.playerRoles.set(socket.id, room.playerRoles.get(oldSocketId))
        room.playerRoles.delete(oldSocketId)
      }
      if (room.playerReadiness.has(oldSocketId)) {
        room.playerReadiness.set(socket.id, room.playerReadiness.get(oldSocketId))
        room.playerReadiness.delete(oldSocketId)
      }
      if (room.alivePlayers.has(oldSocketId)) {
        room.alivePlayers.delete(oldSocketId)
        room.alivePlayers.add(socket.id)
        console.log(`Restored alive status for ${playerName}`)
      }
      if (room.mafiaVotes.has(oldSocketId)) {
        room.mafiaVotes.set(socket.id, room.mafiaVotes.get(oldSocketId))
        room.mafiaVotes.delete(oldSocketId)
      }
      
      // Update accusations
      room.accusations.forEach((accusers, accusedId) => {
        if (accusers.has(oldSocketId)) {
          accusers.delete(oldSocketId)
          accusers.add(socket.id)
        }
      })
      if (room.accusations.has(oldSocketId)) {
        room.accusations.set(socket.id, room.accusations.get(oldSocketId))
        room.accusations.delete(oldSocketId)
      }
      
      socket.join(roomId)
      socket.roomId = roomId
      socket.playerName = playerName.trim()
      socket.isHost = false
      
      console.log(`Player ${playerName} state restored - alive: ${room.alivePlayers.has(socket.id)}`)
      
      // Send success response
      socket.emit(SOCKET_EVENTS.PLAYER_JOINED, { 
        success: true, 
        playerId: socket.id,
        playerName: playerName.trim(),
        reconnectToken: null
      })
      
      // Broadcast updated state
      broadcastMasterGameState(room, roomId)
      
      return
    } else if (existingPlayer) {
      // Lobby case - name already taken
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
    const reconnectToken = initializePlayerConnection(socket.id, roomId, playerName.trim())

    console.log(`Player ${playerName} joined room ${roomId}`)

    // Confirm join to the player with reconnect token
    socket.emit(SOCKET_EVENTS.PLAYER_JOINED, { 
      success: true, 
      playerId: socket.id,
      playerName: playerName.trim(),
      reconnectToken: reconnectToken
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
      
      // For relay server, just remove from players list and let host handle disconnections
      const updatedPlayers = room.players.filter(p => p.id !== player.id);
      room.players = updatedPlayers;
      
      console.log(`Player ${player.name} removed from room ${socket.roomId}`);
    } else {
      console.log(`Disconnected client ${socket.id} was not found in room ${socket.roomId} players`);
    }
  });
}) 

// Helper function to start night phase - removed for relay server
// Night phase is now started by the host in host-authoritative architecture 