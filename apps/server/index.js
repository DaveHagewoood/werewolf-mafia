import { Server } from 'socket.io'
import { createServer } from 'http'
import { SOCKET_EVENTS, validatePlayerName, GAME_CONFIG, GAME_STATES, PHASES, ROLES, assignRoles } from '@werewolf-mafia/shared'

const httpServer = createServer()
const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST"]
  }
})

// Store game rooms in memory
const gameRooms = new Map()

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
      createdAt: new Date()
    })
  }
  return gameRooms.get(roomId)
}

// Helper function to get Mafia players
function getMafiaPlayers(room) {
  return room.players.filter(player => 
    room.playerRoles.get(player.id)?.name === ROLES.MAFIA.name &&
    room.alivePlayers.has(player.id)
  )
}

// Helper function to get alive non-Mafia players
function getAliveNonMafiaPlayers(room) {
  return room.players.filter(player =>
    room.playerRoles.get(player.id)?.name !== ROLES.MAFIA.name &&
    room.alivePlayers.has(player.id)
  )
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

// Helper function to start consensus timer
function startConsensusTimer(room) {
  // Clear existing timer
  if (room.voteConsensusTimer) {
    clearTimeout(room.voteConsensusTimer)
  }
  
  room.voteConsensusTimer = setTimeout(() => {
    const consensusTarget = checkMafiaVoteConsensus(room)
    if (consensusTarget) {
      // Lock in the kill and complete night action
      console.log(`Mafia consensus reached in room ${room.id}: targeting ${consensusTarget}`)
      
      // Remove target from alive players (they are eliminated)
      room.alivePlayers.delete(consensusTarget)
      
      // Find target player name for logging
      const targetPlayer = room.players.find(p => p.id === consensusTarget)
      console.log(`Player ${targetPlayer?.name} was eliminated by the Mafia in room ${room.id}`)
      
      // Notify all players that night action is complete
      io.to(room.id).emit(SOCKET_EVENTS.NIGHT_ACTION_COMPLETE, {
        eliminatedPlayer: {
          id: consensusTarget,
          name: targetPlayer?.name
        }
      })
      
      // Reset for next phase
      room.mafiaVotes.clear()
      room.voteConsensusTimer = null
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

  // Player joins a room
  socket.on(SOCKET_EVENTS.PLAYER_JOIN, (data) => {
    const { playerName, roomId } = data

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
    const newPlayer = {
      id: socket.id,
      name: playerName.trim(),
      connected: true
    }

    room.players.push(newPlayer)
    socket.join(roomId)
    socket.roomId = roomId
    socket.playerName = playerName.trim()
    socket.isHost = false

    console.log(`Player ${playerName} joined room ${roomId}`)

    // Confirm join to the player
    socket.emit(SOCKET_EVENTS.PLAYER_JOINED, { success: true })

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
      const roles = assignRoles(room.players.length)
      
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

    // Verify player is Mafia
    const playerRole = room.playerRoles.get(socket.id)
    if (playerRole?.name !== ROLES.MAFIA.name) {
      socket.emit('error', { message: 'Only Mafia can vote during night phase' })
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
        if (targetRole?.name === ROLES.MAFIA.name) {
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
      
      startConsensusTimer(room)
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
  console.log(`🎮 Host: http://localhost:3000`)
  console.log(`📱 Player: http://localhost:3001`)
}) 