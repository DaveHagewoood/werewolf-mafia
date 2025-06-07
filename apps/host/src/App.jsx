import { Routes, Route } from 'react-router-dom'
import { useState, useEffect } from 'react'
import QRCode from 'qrcode.react'
import { io } from 'socket.io-client'
import { generateRoomId, SOCKET_EVENTS, GAME_CONFIG, GAME_STATES } from '@werewolf-mafia/shared'

function GameLobby() {
  const [roomId, setRoomId] = useState('')
  const [players, setPlayers] = useState([])
  const [canStartGame, setCanStartGame] = useState(false)
  const [socket, setSocket] = useState(null)
  const [gameState, setGameState] = useState(GAME_STATES.LOBBY)
  const [playerReadiness, setPlayerReadiness] = useState([])
  const [eliminatedPlayer, setEliminatedPlayer] = useState(null)

  // Player app URL - you'll need to update this with your actual player app URL
  const PLAYER_APP_URL = 'http://localhost:3001'

  useEffect(() => {
    // Generate room ID
    const newRoomId = generateRoomId()
    setRoomId(newRoomId)
    
    // Connect to Socket.IO server
    const hostSocket = io('http://localhost:3002')
    setSocket(hostSocket)

    // Join the room as host
    hostSocket.emit('host-room', { roomId: newRoomId })

    // Listen for player updates
    hostSocket.on(SOCKET_EVENTS.PLAYERS_UPDATE, (data) => {
      setPlayers(data.players)
      setCanStartGame(data.canStart)
    })

    // Listen for readiness updates during role assignment
    hostSocket.on(SOCKET_EVENTS.READINESS_UPDATE, (data) => {
      setPlayerReadiness(data.players)
    })

    // Listen for night phase start
    hostSocket.on(SOCKET_EVENTS.START_NIGHT_PHASE, (data) => {
      setGameState(GAME_STATES.NIGHT_PHASE)
      setEliminatedPlayer(null) // Reset for new night
      console.log('Night phase started!')
    })

    // Listen for night action completion
    hostSocket.on(SOCKET_EVENTS.NIGHT_ACTION_COMPLETE, (data) => {
      console.log('Night action completed:', data.eliminatedPlayer)
      setEliminatedPlayer(data.eliminatedPlayer)
    })

    // Listen for errors
    hostSocket.on('error', (error) => {
      console.error('Socket error:', error.message)
    })

    // Cleanup on unmount
    return () => {
      if (hostSocket) {
        hostSocket.disconnect()
      }
    }
  }, [])

  const handleStartGame = () => {
    if (canStartGame && socket) {
      socket.emit(SOCKET_EVENTS.GAME_START, { roomId })
      setGameState(GAME_STATES.ROLE_ASSIGNMENT)
      console.log('Starting game...')
    }
  }

  const autoFillPlayers = () => {
    const playerNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry']
    const baseUrl = 'http://localhost:3001'
    
    playerNames.forEach((name, index) => {
      const url = `${baseUrl}/join/${roomId}?playerName=${name}&autoJoin=true`
      setTimeout(() => {
        window.open(url, `_blank_player_${index}`)
        console.log(`Opening tab for ${name}: ${url}`)
      }, index * 300) // Slightly faster stagger for 8 players
    })
  }

  const qrCodeUrl = `${PLAYER_APP_URL}/join/${roomId}`

  // Show night phase screen
  if (gameState === GAME_STATES.NIGHT_PHASE) {
    return (
      <div className="night-container">
        <div className="night-header">
          <h1>Werewolf Mafia</h1>
          <h2>Room Code: {roomId}</h2>
        </div>
        
        <div className="night-content">
          <div className="night-icon">🌙</div>
          <h2>Night Phase</h2>
          <p>The town sleeps while the Mafia makes their move...</p>
          
          {eliminatedPlayer ? (
            <div className="night-result">
              <div className="elimination-notice">
                <h3>Night Action Complete</h3>
                <p>
                  <strong>{eliminatedPlayer.name}</strong> was eliminated by the Mafia.
                </p>
              </div>
              
              <div className="next-phase-info">
                <p>The night phase is complete. Day phase coming soon...</p>
              </div>
            </div>
          ) : (
            <div className="night-progress">
              <div className="night-spinner"></div>
              <p>Mafia is selecting their target...</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Show waiting for players to confirm roles screen
  if (gameState === GAME_STATES.ROLE_ASSIGNMENT) {
    return (
      <div className="waiting-container">
        <div className="waiting-header">
          <h1>Werewolf Mafia</h1>
          <h2>Room Code: {roomId}</h2>
        </div>
        
        <div className="waiting-content">
          <h2>Waiting for Players to Confirm Roles...</h2>
          <p>Roles have been assigned. Players are reviewing their secret roles.</p>
          
          {playerReadiness.length > 0 ? (
            <>
              <div className="readiness-list">
                {playerReadiness.map((player) => (
                  <div key={player.id} className="readiness-item">
                    <span className="readiness-status">
                      {player.ready ? '✅' : '⏳'}
                    </span>
                    <span className="player-name">{player.name}</span>
                    <span className="ready-text">
                      {player.ready ? 'Ready' : 'Reviewing role...'}
                    </span>
                  </div>
                ))}
              </div>
              
              <div className="waiting-progress">
                <div className="progress-info">
                  {playerReadiness.filter(p => p.ready).length} of {playerReadiness.length} players ready
                </div>
                {playerReadiness.length > 0 && playerReadiness.every(p => p.ready) && (
                  <div className="all-ready-message">
                    🎉 All players are ready! Starting night phase...
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="loading-roles">
              <div className="spinner"></div>
              <p>Assigning roles to players...</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Show in-progress screen placeholder
  if (gameState === GAME_STATES.IN_PROGRESS) {
    return (
      <div className="game-container">
        <div className="game-header">
          <h1>Werewolf Mafia</h1>
          <h2>Room Code: {roomId}</h2>
        </div>
        
        <div className="game-content">
          <h2>Game In Progress</h2>
          <p>Night phase has begun...</p>
          {/* TODO: Implement actual game phases */}
        </div>
      </div>
    )
  }

  // Default lobby view
  return (
    <div className="lobby-container">
      <div className="lobby-header">
        <h1>Werewolf Mafia</h1>
        <h2>Room Code: {roomId}</h2>
      </div>

      <div className="lobby-content">
        <div className="qr-section">
          <h3>Scan to Join</h3>
          {roomId && (
            <QRCode 
              value={qrCodeUrl} 
              size={200}
              bgColor="#ffffff"
              fgColor="#000000"
            />
          )}
          <p className="join-url">{qrCodeUrl}</p>
        </div>

        <div className="players-section">
          <h3>Players ({players.length}/{GAME_CONFIG.MAX_PLAYERS})</h3>
          <div className="players-list">
            {players.length === 0 ? (
              <p className="no-players">Waiting for players to join...</p>
            ) : (
              players.map((player, index) => (
                <div key={player.id} className="player-item">
                  <span className="player-number">{index + 1}.</span>
                  <span className="player-name">{player.name}</span>
                  <span className={`player-status ${player.connected ? 'connected' : 'disconnected'}`}>
                    {player.connected ? '🟢' : '🔴'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="game-controls">
          <button 
            className={`start-game-btn ${canStartGame ? 'enabled' : 'disabled'}`}
            onClick={handleStartGame}
            disabled={!canStartGame}
          >
            {canStartGame ? 'Start Game' : `Need ${GAME_CONFIG.MIN_PLAYERS - players.length} more players`}
          </button>
          
          {/* Debug: Auto-fill players for testing */}
          {players.length < GAME_CONFIG.MIN_PLAYERS && (
            <button 
              className="auto-fill-btn" 
              onClick={autoFillPlayers}
            >
              🚀 Auto-fill 8 Players
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<GameLobby />} />
      </Routes>
    </div>
  )
}

export default App 