import { Routes, Route } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import { SOCKET_EVENTS, validatePlayerName } from '@werewolf-mafia/shared'

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
      }
    })

    // Listen for errors
    newSocket.on('error', (data) => {
      setError(data.message)
      setIsJoining(false)
    })

    // Listen for game start
    newSocket.on(SOCKET_EVENTS.GAME_START, () => {
      console.log('Game is starting!')
      // TODO: Navigate to game screen
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