import { Routes, Route } from 'react-router-dom'
import { useState, useEffect } from 'react'
import QRCode from 'qrcode.react'
import { io } from 'socket.io-client'
import { generateRoomId, SOCKET_EVENTS, GAME_CONFIG } from '@werewolf-mafia/shared'

function GameLobby() {
  const [roomId, setRoomId] = useState('')
  const [players, setPlayers] = useState([])
  const [canStartGame, setCanStartGame] = useState(false)
  const [socket, setSocket] = useState(null)

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
      console.log('Starting game...')
      // TODO: Navigate to game screen
    }
  }

  const qrCodeUrl = `${PLAYER_APP_URL}/join/${roomId}`

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