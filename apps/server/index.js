import { Server } from 'socket.io'
import { createServer } from 'http'
import { SOCKET_EVENTS, validatePlayerName, GAME_CONFIG, GAME_STATES, PHASES, ROLES, ROLE_SETS, GAME_TYPES, PROFILE_IMAGES, getProfileImageUrl, assignRoles } from './shared.js'

const httpServer = createServer()

// Configure CORS for both development and production
const allowedOrigins = [
  "http://localhost:3000", 
  "http://localhost:3001",
  // Add Serveo URLs (clean and free!)
  "https://werewolf-host.serveo.net", // Host Serveo URL
  "https://werewolf-player.serveo.net", // Player Serveo URL
  // Add production URLs when you deploy the client apps
  process.env.HOST_URL,
  process.env.PLAYER_URL
].filter(Boolean)

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
})

// Store game rooms in memory
const gameRooms = new Map()

// Store game types for each room
const roomGameTypes = new Map()

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

// Helper function to check if night phase is complete
function checkNightCompletion(room, roomId) {
  const mafiaPlayers = getMafiaPlayers(room)
  const doctorPlayers = getDoctorPlayers(room, roomId)
  const seerPlayers = getSeerPlayers(room, roomId)
  
  // Check if Mafia action is complete (consensus reached and timer expired)
  const mafiaTarget = checkMafiaVoteConsensus(room)
  const mafiaActionComplete = mafiaTarget && !room.voteConsensusTimer
  
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
          targets: investigationTargets.map(player => ({ id: player.id, name: player.name }))
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
  const updateData = {
    players: room.players,
    canStart: room.players.length >= GAME_CONFIG.MIN_PLAYERS && room.gameState === GAME_STATES.LOBBY
  }
  
  io.to(roomId).emit(SOCKET_EVENTS.PLAYERS_UPDATE, updateData)
}

// Helper function to broadcast readiness updates to host
function broadcastReadinessUpdate(roomId) {
  const room = getRoom(roomId)
  const readinessData = room.players.map(player => ({
    id: player.id,
    name: player.name,
    ready: room.playerReadiness.get(player.id) || false
  }))
  
  // Send to host only
  const hostSocket = io.sockets.sockets.get(room.host)
  if (hostSocket) {
    hostSocket.emit(SOCKET_EVENTS.READINESS_UPDATE, { players: readinessData })
  }
}

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`)

  // Host creates/joins a room
  socket.on('host-room', (data) => {
    const { roomId } = data
    const room = getRoom(roomId)
    
    // Set this socket as the host
    room.host = socket.id
    socket.join(roomId)
    socket.roomId = roomId
    socket.isHost = true
    
    console.log(`Host ${socket.id} created room ${roomId}`)
    
    // Send initial room state to host
    broadcastPlayersUpdate(roomId)
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

    console.log(`Player ${playerName} joined room ${roomId}`)

    // Confirm join to the player
    socket.emit(SOCKET_EVENTS.PLAYER_JOINED, { 
      success: true, 
      playerId: socket.id,
      playerName: playerName.trim()
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
    
    // Check if all players are ready
    const allReady = room.players.every(player => room.playerReadiness.get(player.id))
    
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

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`)
    
    if (socket.roomId) {
      const room = getRoom(socket.roomId)
      
      if (socket.isHost) {
        // Host disconnected - could handle room cleanup here
        console.log(`Host disconnected from room ${socket.roomId}`)
      } else if (socket.playerName) {
        // Remove player from room
        const playerIndex = room.players.findIndex(p => p.id === socket.id)
        if (playerIndex !== -1) {
          const removedPlayer = room.players.splice(playerIndex, 1)[0]
          console.log(`Player ${removedPlayer.name} left room ${socket.roomId}`)
          
          // Clean up player data
          room.playerRoles.delete(socket.id)
          room.playerReadiness.delete(socket.id)
          room.alivePlayers.delete(socket.id)
          room.mafiaVotes.delete(socket.id)
          
          // Broadcast updated player list
          broadcastPlayersUpdate(socket.roomId)
          
          // If in role assignment phase, update readiness
          if (room.gameState === GAME_STATES.ROLE_ASSIGNMENT) {
            broadcastReadinessUpdate(socket.roomId)
          }
        }
      }
    }
  })
})

const PORT = process.env.PORT || 3002
httpServer.listen(PORT, () => {
  console.log(`🚀 Werewolf Mafia Server running on port ${PORT}`)
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`🎮 Host URL: ${process.env.HOST_URL || 'http://localhost:3000'}`)
  console.log(`📱 Player URL: ${process.env.PLAYER_URL || 'http://localhost:3001'}`)
  console.log(`🔌 CORS origins:`, allowedOrigins)
}) 