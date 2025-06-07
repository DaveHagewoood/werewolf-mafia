import { Routes, Route } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import { SOCKET_EVENTS, validatePlayerName, GAME_STATES } from '@werewolf-mafia/shared'

function HomePage() {
  return (
    <div className="home-container">
      <h1>Werewolf Mafia</h1>
      <p>Scan the QR code from the host to join a game!</p>
    </div>
  )
}

function JoinRoom() {
  const { roomId } = useParams()
  const [playerName, setPlayerName] = useState('')
  const [isJoining, setIsJoining] = useState(false)
  const [isWaiting, setIsWaiting] = useState(false)
  const [error, setError] = useState('')
  const [socket, setSocket] = useState(null)
  const [gameState, setGameState] = useState(GAME_STATES.LOBBY)
  const [playerRole, setPlayerRole] = useState(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    // Connect to Socket.IO server
    const newSocket = io('http://localhost:3002')
    setSocket(newSocket)

    // Listen for join confirmation
    newSocket.on(SOCKET_EVENTS.PLAYER_JOINED, (data) => {
      if (data.success) {
        setIsWaiting(true)
        setIsJoining(false)
        setError('')
        setGameState(GAME_STATES.LOBBY)
      }
    })

    // Listen for role assignment
    newSocket.on(SOCKET_EVENTS.ROLE_ASSIGNED, (data) => {
      setPlayerRole(data.role)
      setGameState(GAME_STATES.ROLE_ASSIGNMENT)
      setIsReady(false)
      console.log('Role assigned:', data.role.name)
    })

    // Listen for night phase start
    newSocket.on(SOCKET_EVENTS.START_NIGHT_PHASE, (data) => {
      setGameState(GAME_STATES.IN_PROGRESS)
      console.log('Night phase started!')
      // TODO: Navigate to game screen
    })

    // Listen for errors
    newSocket.on('error', (data) => {
      setError(data.message)
      setIsJoining(false)
    })

    // Listen for game start (legacy - now handled by role assignment)
    newSocket.on(SOCKET_EVENTS.GAME_START, () => {
      console.log('Game is starting!')
      // This event is now replaced by ROLE_ASSIGNED
    })

    // Cleanup on unmount
    return () => {
      if (newSocket) {
        newSocket.disconnect()
      }
    }
  }, [])

  const handleJoinRoom = (e) => {
    e.preventDefault()
    
    if (!validatePlayerName(playerName)) {
      setError('Name must be 2-20 characters long')
      return
    }

    if (!socket) {
      setError('Connection failed. Please try again.')
      return
    }

    setIsJoining(true)
    setError('')

    // Emit join event to server
    socket.emit(SOCKET_EVENTS.PLAYER_JOIN, {
      playerName: playerName.trim(),
      roomId: roomId
    })
  }

  const handleReady = () => {
    if (socket && !isReady) {
      socket.emit(SOCKET_EVENTS.PLAYER_READY, { roomId })
      setIsReady(true)
    }
  }

  // Show role assignment screen
  if (gameState === GAME_STATES.ROLE_ASSIGNMENT && playerRole) {
    return (
      <div className="role-container">
        <div className="role-content">
          <div className="role-header">
            <div className="warning-banner">
              ⚠️ <strong>SECRET ROLE</strong> ⚠️
            </div>
            <h1>Your Role</h1>
            <p className="warning-text">
              <strong>Do not show this screen to anyone else!</strong>
            </p>
          </div>

          <div className="role-card" style={{ borderColor: playerRole.color }}>
            <div className="role-name" style={{ color: playerRole.color }}>
              {playerRole.name}
            </div>
            
            <div className="role-alignment">
              <span className={`alignment-badge ${playerRole.alignment}`}>
                {playerRole.alignment === 'good' ? '😇 Good' : '😈 Evil'}
              </span>
            </div>

            <div className="role-description">
              <h3>Description</h3>
              <p>{playerRole.description}</p>
            </div>

            <div className="role-ability">
              <h3>Special Ability</h3>
              <p>{playerRole.ability}</p>
            </div>
          </div>

          <div className="role-footer">
            <p className="player-info">Playing as: <strong>{playerName}</strong></p>
            <p className="room-info">Room: <strong>{roomId}</strong></p>
            
            <button 
              className={`ready-btn ${isReady ? 'ready' : ''}`}
              onClick={handleReady}
              disabled={isReady}
            >
              {isReady ? '✅ Ready - Waiting for others...' : 'I understand my role - Ready!'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Show game in progress screen
  if (gameState === GAME_STATES.IN_PROGRESS) {
    return (
      <div className="game-container">
        <div className="game-content">
          <h1>Night Phase</h1>
          <p className="player-info">Playing as: <strong>{playerName}</strong></p>
          <p className="role-info">You are: <strong style={{ color: playerRole?.color }}>{playerRole?.name}</strong></p>
          <p>The game has begun...</p>
          {/* TODO: Implement actual game phases */}
        </div>
      </div>
    )
  }

  // Show waiting in lobby screen
  if (isWaiting) {
    return (
      <div className="waiting-container">
        <div className="waiting-content">
          <div className="spinner"></div>
          <h2>You're in the game!</h2>
          <p>Room: <strong>{roomId}</strong></p>
          <p>Waiting for the host to start the game...</p>
          <div className="player-info">
            <span className="player-name">Playing as: {playerName}</span>
          </div>
        </div>
      </div>
    )
  }

  // Show join form
  return (
    <div className="join-container">
      <div className="join-content">
        <h1>Join Game</h1>
        <p className="room-info">Room: <strong>{roomId}</strong></p>
        
        <form onSubmit={handleJoinRoom} className="join-form">
          <div className="form-group">
            <label htmlFor="playerName">Your Name</label>
            <input
              type="text"
              id="playerName"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your display name"
              maxLength={20}
              disabled={isJoining}
              required
            />
          </div>
          
          {error && <div className="error-message">{error}</div>}
          
          <button 
            type="submit" 
            className="join-btn"
            disabled={isJoining || !playerName.trim()}
          >
            {isJoining ? 'Joining...' : 'Join Game'}
          </button>
        </form>
      </div>
    </div>
  )
}

function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/join/:roomId" element={<JoinRoom />} />
      </Routes>
    </div>
  )
}

export default App 