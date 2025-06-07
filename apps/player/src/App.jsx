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
  const [voteTargets, setVoteTargets] = useState([])
  const [selectedTarget, setSelectedTarget] = useState(null)
  const [hasVoted, setHasVoted] = useState(false)
  const [eliminatedPlayer, setEliminatedPlayer] = useState(null)
  const [mafiaVotes, setMafiaVotes] = useState({}) // { playerId: { name, target, targetName } }
  const [consensusTimer, setConsensusTimer] = useState(null) // { targetId, targetName, timeLeft }

  useEffect(() => {
    // Connect to Socket.IO server
    const newSocket = io('http://localhost:3002')
    setSocket(newSocket)

    // Check for auto-join URL parameters
    const urlParams = new URLSearchParams(window.location.search)
    const autoJoinPlayerName = urlParams.get('playerName')
    const shouldAutoJoin = urlParams.get('autoJoin') === 'true'

    if (shouldAutoJoin && autoJoinPlayerName && roomId) {
      // Auto-join with pre-filled data
      console.log(`Auto-join detected: ${autoJoinPlayerName} -> ${roomId}`)
      setPlayerName(autoJoinPlayerName)
      setIsJoining(true)
      
      // Wait for socket to connect, then join
      newSocket.on('connect', () => {
        console.log('Socket connected, auto-joining...')
        newSocket.emit(SOCKET_EVENTS.PLAYER_JOIN, {
          roomId: roomId,
          playerName: autoJoinPlayerName
        })
      })
    }

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
      setGameState(GAME_STATES.NIGHT_PHASE)
      setHasVoted(false)
      setSelectedTarget(null)
      setEliminatedPlayer(null)
      console.log('Night phase started!')
    })

    // Listen for Mafia voting (only Mafia will receive this)
    newSocket.on(SOCKET_EVENTS.BEGIN_MAFIA_VOTE, (data) => {
      setVoteTargets(data.targets)
      console.log('Mafia voting started, targets:', data.targets)
    })

    // Listen for night action completion
    newSocket.on(SOCKET_EVENTS.NIGHT_ACTION_COMPLETE, (data) => {
      setEliminatedPlayer(data.eliminatedPlayer)
      console.log('Night action completed:', data.eliminatedPlayer)
    })

    // Listen for Mafia vote updates (real-time vote sharing)
    newSocket.on(SOCKET_EVENTS.MAFIA_VOTES_UPDATE, (data) => {
      setMafiaVotes(data.votes)
      console.log('Mafia votes updated:', data.votes)
    })

    // Listen for consensus timer start
    newSocket.on(SOCKET_EVENTS.CONSENSUS_TIMER_START, (data) => {
      setConsensusTimer({
        targetId: data.targetId,
        targetName: data.targetName,
        timeLeft: Math.floor(data.duration / 1000) // Convert to seconds
      })
      console.log('Consensus timer started for:', data.targetName)
    })

    // Listen for consensus timer cancelled
    newSocket.on(SOCKET_EVENTS.CONSENSUS_TIMER_CANCELLED, () => {
      setConsensusTimer(null)
      console.log('Consensus timer cancelled')
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

  // Countdown timer effect
  useEffect(() => {
    if (consensusTimer && consensusTimer.timeLeft > 0) {
      const timer = setTimeout(() => {
        setConsensusTimer(prev => prev ? { ...prev, timeLeft: prev.timeLeft - 1 } : null)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [consensusTimer])

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

  const handleMafiaVote = (targetId) => {
    if (socket) {
      // Toggle vote off if clicking same target
      if (selectedTarget === targetId) {
        socket.emit(SOCKET_EVENTS.MAFIA_VOTE, { targetId: null })
        setSelectedTarget(null)
        setHasVoted(false)
        console.log('Removed vote')
      } else {
        socket.emit(SOCKET_EVENTS.MAFIA_VOTE, { targetId })
        setSelectedTarget(targetId)
        setHasVoted(true)
        console.log('Voted for target:', targetId)
      }
    }
  }

  // Show night phase screen
  if (gameState === GAME_STATES.NIGHT_PHASE && playerRole) {
    // Mafia voting interface - check if this player is Mafia
    if (playerRole.name === 'Mafia') {
      // If we haven't received vote targets yet, show loading
      if (voteTargets.length === 0) {
        return (
          <div className="mafia-vote-container">
            <div className="mafia-vote-content">
              <div className="night-header">
                <div className="night-icon">🌙</div>
                <h1>Night Phase</h1>
                <p className="role-reminder">You are: <strong style={{ color: playerRole.color }}>{playerRole.name}</strong></p>
              </div>

              <div className="vote-section">
                <h2>Preparing...</h2>
                <div className="night-progress">
                  <div className="night-spinner"></div>
                  <p>Gathering intelligence on targets...</p>
                </div>
              </div>
            </div>
          </div>
        )
      }
      return (
        <div className="mafia-vote-container">
          <div className="mafia-vote-content">
            <div className="night-header">
              <div className="night-icon">🌙</div>
              <h1>Night Phase</h1>
              <p className="role-reminder">You are: <strong style={{ color: playerRole.color }}>{playerRole.name}</strong></p>
            </div>

            <div className="vote-section">
              <h2>Choose Your Target</h2>
              <p>Select a player to eliminate tonight:</p>
              
              <div className="target-list">
                {voteTargets.map((target) => (
                  <button
                    key={target.id}
                    className={`target-btn ${selectedTarget === target.id ? 'selected' : ''}`}
                    onClick={() => handleMafiaVote(target.id)}
                  >
                    <span className="target-name">{target.name}</span>
                    {selectedTarget === target.id && <span className="vote-indicator">✓ Voted</span>}
                  </button>
                ))}
              </div>

              {Object.keys(mafiaVotes).length > 1 && (
                <div className="other-votes-section">
                  <h3>Team Votes</h3>
                  {Object.entries(mafiaVotes).map(([playerId, voteData]) => (
                    <div key={playerId} className="vote-status">
                      <span className="voter-name">{voteData.name}:</span>
                      <span className="vote-target">
                        {voteData.target ? voteData.targetName : 'No vote'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {consensusTimer && (
                <div className="consensus-timer">
                  <h3>🎯 Consensus Reached!</h3>
                  <p>Targeting: <strong>{consensusTimer.targetName}</strong></p>
                  <div className="countdown">
                    <span className="timer">{consensusTimer.timeLeft}</span>
                    <small>seconds to lock in</small>
                  </div>
                </div>
              )}

              {hasVoted && !consensusTimer && (
                <div className="vote-confirmation">
                  <p>Vote cast! Click the same target again to remove your vote.</p>
                  <div className="consensus-info">
                    <small>All Mafia must agree for 5 seconds to lock in the target</small>
                  </div>
                </div>
              )}
            </div>

            {eliminatedPlayer && (
              <div className="elimination-result">
                <h3>Target Eliminated</h3>
                <p><strong>{eliminatedPlayer.name}</strong> has been eliminated.</p>
              </div>
            )}
          </div>
        </div>
      )
    }

    // Non-Mafia night phase (waiting screen)
    return (
      <div className="night-wait-container">
        <div className="night-wait-content">
          <div className="night-header">
            <div className="night-icon">🌙</div>
            <h1>Night Phase</h1>
            <p className="role-reminder">You are: <strong style={{ color: playerRole.color }}>{playerRole.name}</strong></p>
          </div>

          <div className="sleep-section">
            <div className="sleep-icon">😴</div>
            <h2>Sleep Tight</h2>
            <p>The town sleeps while dark forces move in the shadows...</p>
            
            <div className="night-progress">
              <div className="night-spinner"></div>
              <p>Waiting for night actions to complete...</p>
            </div>
          </div>

          {eliminatedPlayer && (
            <div className="elimination-result">
              <h3>Dawn Breaks</h3>
              <p>The town wakes to discover that <strong>{eliminatedPlayer.name}</strong> has been eliminated.</p>
            </div>
          )}
        </div>
      </div>
    )
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