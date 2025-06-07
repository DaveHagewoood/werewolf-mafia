import { Server } from 'socket.io'
import { createServer } from 'http'
import { SOCKET_EVENTS, validatePlayerName, GAME_CONFIG } from '@werewolf-mafia/shared'

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
      gameStarted: false,
      createdAt: new Date()
    })
  }
  return gameRooms.get(roomId)
}

// Helper function to broadcast player updates to room
function broadcastPlayersUpdate(roomId) {
  const room = getRoom(roomId)
  const updateData = {
    players: room.players,
    canStart: room.players.length >= GAME_CONFIG.MIN_PLAYERS && !room.gameStarted
  }
  
  io.to(roomId).emit(SOCKET_EVENTS.PLAYERS_UPDATE, updateData)
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
    if (room.gameStarted) {
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

    room.gameStarted = true
    
    // Notify all players that game is starting
    io.to(roomId).emit(SOCKET_EVENTS.GAME_START, { roomId })
    console.log(`Game started in room ${roomId}`)
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
          
          // Broadcast updated player list
          broadcastPlayersUpdate(socket.roomId)
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