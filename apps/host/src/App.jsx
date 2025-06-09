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
  const [savedPlayer, setSavedPlayer] = useState(null)
  const [accusations, setAccusations] = useState({})
  const [eliminationCountdown, setEliminationCountdown] = useState(null)
  const [dayEliminatedPlayer, setDayEliminatedPlayer] = useState(null)
  const [message, setMessage] = useState(null)
  const [gameEndData, setGameEndData] = useState(null)
  const [selectedGameType, setSelectedGameType] = useState(null)

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
      setSavedPlayer(null) // Reset saved player for new night
      setMessage(null) // Clear any old messages
      console.log('Night phase started!')
    })

    // Listen for night resolution
    hostSocket.on(SOCKET_EVENTS.NIGHT_RESOLUTION, (data) => {
      console.log('Night resolution:', data)
      setEliminatedPlayer(data.killedPlayer)
      setSavedPlayer(data.savedPlayer)
      
      // After 3 seconds, start day phase (placeholder)
      setTimeout(() => {
        console.log('Starting day phase placeholder...')
        // TODO: Implement day phase
      }, 3000)
    })

    // Listen for day phase start
    hostSocket.on(SOCKET_EVENTS.START_DAY_PHASE, (data) => {
      setGameState(GAME_STATES.DAY_PHASE)
      setAccusations({})
      setEliminationCountdown(null)
      setDayEliminatedPlayer(null)
      setMessage(null) // Clear any old messages
      console.log('Day phase started!')
    })

    // Listen for accusation updates
    hostSocket.on(SOCKET_EVENTS.ACCUSATIONS_UPDATE, (data) => {
      setAccusations(data.accusations)
      console.log('Accusations updated:', data.accusations)
    })

    // Listen for elimination countdown
    hostSocket.on(SOCKET_EVENTS.ELIMINATION_COUNTDOWN, (data) => {
      setEliminationCountdown({
        targetId: data.targetId,
        targetName: data.targetName,
        timeLeft: Math.floor(data.duration / 1000)
      })
      console.log('Elimination countdown started for:', data.targetName)
    })

    // Listen for countdown cancelled
    hostSocket.on(SOCKET_EVENTS.COUNTDOWN_CANCELLED, () => {
      setEliminationCountdown(null)
      console.log('Elimination countdown cancelled')
    })

    // Listen for player elimination
    hostSocket.on(SOCKET_EVENTS.PLAYER_ELIMINATED, (data) => {
      console.log('Player eliminated during day:', data.eliminatedPlayer)
      setDayEliminatedPlayer(data.eliminatedPlayer)
      setEliminationCountdown(null)
      setAccusations({})
    })

    // Listen for night action completion (legacy event)
    hostSocket.on(SOCKET_EVENTS.NIGHT_ACTION_COMPLETE, (data) => {
      console.log('Night action completed (legacy):', data.eliminatedPlayer)
      setEliminatedPlayer(data.eliminatedPlayer)
    })

    // Listen for game end
    hostSocket.on(SOCKET_EVENTS.GAME_END, (data) => {
      console.log('Game ended:', data)
      setGameEndData(data)
      setGameState(GAME_STATES.ENDED)
    })

    // Listen for game type selected
    hostSocket.on(SOCKET_EVENTS.GAME_TYPE_SELECTED, (gameType) => {
      console.log('Game type selected:', gameType)
      setSelectedGameType(gameType)
      setGameState(GAME_STATES.LOBBY)
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

  // Elimination countdown effect
  useEffect(() => {
    if (eliminationCountdown && eliminationCountdown.timeLeft > 0) {
      const timer = setTimeout(() => {
        setEliminationCountdown(prev => prev ? { ...prev, timeLeft: prev.timeLeft - 1 } : null)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [eliminationCountdown])

  const handleStartGame = () => {
    if (canStartGame && socket) {
      socket.emit(SOCKET_EVENTS.GAME_START, { roomId })
      setGameState(GAME_STATES.ROLE_ASSIGNMENT)
      console.log('Starting game...')
    }
  }

  const autoFillPlayers = () => {
    const playerNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve']
    const baseUrl = 'http://localhost:3001'
    
    playerNames.forEach((name, index) => {
      const url = `${baseUrl}/join/${roomId}?playerName=${name}&autoJoin=true`
      setTimeout(() => {
        window.open(url, `_blank_player_${index}`)
        console.log(`Opening tab for ${name}: ${url}`)
      }, index * 300) // Stagger for 5 players
    })
  }

  const handleGameTypeSelect = (gameType) => {
    console.log('Game type selected:', gameType)
    if (socket) {
      socket.emit(SOCKET_EVENTS.SELECT_GAME_TYPE, { roomId, gameType })
    } else {
      console.log('Socket not available')
    }
  }

  const qrCodeUrl = `${PLAYER_APP_URL}/join/${roomId}`

  // Show main menu screen (before game type is selected)
  if (!selectedGameType) {
    return (
      <div className="main-menu-container">
        <div className="main-menu-header">
          <h1>🎭 Werewolf Mafia</h1>
          <h2>Room Code: {roomId}</h2>
        </div>
        
        <div className="main-menu-content">
          <div className="game-selection">
            <h3>Choose Your Game</h3>
            <p>Both games use the same mechanics but different themes and role names</p>
            
            <div className="game-options">
              <div 
                className="game-option game-option-werewolf" 
                onClick={() => handleGameTypeSelect('werewolf')}
              >
                {/* Content handled by background image */}
              </div>
              
              <div 
                className="game-option game-option-mafia" 
                onClick={() => handleGameTypeSelect('mafia')}
              >
                {/* Content handled by background image */}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Show game end screen
  if (gameState === GAME_STATES.ENDED && gameEndData) {
    return (
      <div className="game-end-container">
        <div className="game-end-header">
          <h1>Werewolf Mafia</h1>
          <h2>Room Code: {roomId}</h2>
        </div>
        
        <div className="game-end-content">
          <div className={`victory-announcement ${gameEndData.winner}`}>
            <div className="victory-icon">
              {gameEndData.winner === 'mafia' ? '🔥' : '🏆'}
            </div>
            <h2>
              {gameEndData.winner === 'mafia' ? 'Mafia Victory!' : 'Villagers Victory!'}
            </h2>
            <p className="win-condition">{gameEndData.winCondition}</p>
          </div>

          <div className="final-results">
            <h3>Final Results</h3>
            <div className="results-grid">
              <div className="alive-players">
                <h4>👑 Survivors ({gameEndData.alivePlayers.length})</h4>
                {gameEndData.alivePlayers.map(player => (
                  <div key={player.id} className="result-player alive">
                    <span className="player-name">{player.name}</span>
                    <span className="player-role" style={{ color: player.role.color }}>
                      {player.role.name}
                    </span>
                  </div>
                ))}
              </div>

              <div className="eliminated-players">
                <h4>💀 Eliminated ({gameEndData.allPlayers.filter(p => !p.alive).length})</h4>
                {gameEndData.allPlayers.filter(p => !p.alive).map(player => (
                  <div key={player.id} className="result-player eliminated">
                    <span className="player-name">{player.name}</span>
                    <span className="player-role" style={{ color: player.role.color }}>
                      {player.role.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="game-summary">
            <h3>Game Summary</h3>
            <div className="summary-stats">
              <div className="stat">
                <span className="stat-label">Total Players:</span>
                <span className="stat-value">{gameEndData.allPlayers.length}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Mafia Players:</span>
                <span className="stat-value">
                  {gameEndData.allPlayers.filter(p => p.role.alignment === 'evil').length}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Good Players:</span>
                <span className="stat-value">
                  {gameEndData.allPlayers.filter(p => p.role.alignment === 'good').length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Show day phase screen
  if (gameState === GAME_STATES.DAY_PHASE) {
    return (
      <div className="day-container">
        <div className="day-header">
          <h1>Werewolf Mafia</h1>
          <h2>Room Code: {roomId}</h2>
        </div>
        
        <div className="day-content">
          <div className="day-icon">☀️</div>
          <h2>Day Phase</h2>
          <p>Day has begun. Discuss and vote to eliminate a suspected killer.</p>
          
          {dayEliminatedPlayer ? (
            <div className="day-result">
              <div className="elimination-notice">
                <h3>Player Eliminated</h3>
                <p>
                  <strong>{dayEliminatedPlayer.name}</strong> was eliminated by majority vote.
                </p>
                <p className="mystery-text">Their role remains a mystery...</p>
              </div>
              
              <div className="next-phase-info">
                <p>The day phase is complete. Night phase starting soon...</p>
              </div>
            </div>
          ) : (
            <div className="day-progress">
              {eliminationCountdown ? (
                <div className="countdown-display">
                  <h3>⚖️ Majority Reached!</h3>
                  <p>Eliminating: <strong>{eliminationCountdown.targetName}</strong></p>
                  <div className="countdown-timer">
                    <span className="timer">{eliminationCountdown.timeLeft}</span>
                    <small>seconds remaining</small>
                  </div>
                </div>
              ) : (
                <div className="voting-progress">
                  <p>Players are discussing and voting...</p>
                  
                  {Object.keys(accusations).length > 0 ? (
                    <div className="accusations-display">
                      <h3>Current Accusations</h3>
                      {Object.entries(accusations).map(([accusedId, accusationData]) => (
                        <div key={accusedId} className="accusation-summary">
                          <span className="accused">{accusationData.name}</span>
                          <span className="accusers">accused by: {accusationData.accusers.join(', ')}</span>
                          <span className="vote-count">({accusationData.voteCount} votes)</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="no-accusations">
                      <p>No accusations yet. Players are still discussing...</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

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
          
          {eliminatedPlayer || savedPlayer ? (
            <div className="night-result">
              {eliminatedPlayer && (
                <div className="elimination-notice">
                  <h3>Night Action Complete</h3>
                  <p>
                    <strong>{eliminatedPlayer.name}</strong> was eliminated by the Mafia.
                  </p>
                </div>
              )}
              
              {savedPlayer && (
                <div className="save-notice">
                  <h3>A Life Saved!</h3>
                  <p>
                    The Doctor successfully saved someone from certain death!
                  </p>
                </div>
              )}
              
              {!eliminatedPlayer && savedPlayer && (
                <div className="no-elimination-notice">
                  <h3>No One Was Killed</h3>
                  <p>The Mafia's plan was thwarted by excellent medical intervention!</p>
                </div>
              )}
              
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
        <h1>{selectedGameType === 'mafia' ? '🕴️ Mafia' : '🐺 Werewolf'}</h1>
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
              🚀 Auto-fill 5 Players
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