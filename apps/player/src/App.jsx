import { Routes, Route } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import { SOCKET_EVENTS, validatePlayerName, GAME_STATES, GAME_TYPES, PROFILE_IMAGES, getProfileImageUrl, ROLE_SETS } from '@werewolf-mafia/shared'

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
  const [playerId, setPlayerId] = useState(null) // Add missing playerId state
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
  const [mafiaVotesLocked, setMafiaVotesLocked] = useState(false) // Whether Mafia votes are locked
  const [healTargets, setHealTargets] = useState([]) // Available targets for Doctor to heal
  const [selectedHeal, setSelectedHeal] = useState(null) // Doctor's selected heal target
  const [hasHealed, setHasHealed] = useState(false) // Whether Doctor has made their choice
  const [investigateTargets, setInvestigateTargets] = useState([]) // Available targets for Seer to investigate
  const [selectedInvestigation, setSelectedInvestigation] = useState(null) // Seer's selected target
  const [hasInvestigated, setHasInvestigated] = useState(false) // Whether Seer has investigated
  const [investigationResult, setInvestigationResult] = useState(null) // Seer's investigation result
  const [dayPhaseTargets, setDayPhaseTargets] = useState([]) // Available targets for day phase voting
  const [accusationTarget, setAccusationTarget] = useState(null) // Current accusation target
  const [accusations, setAccusations] = useState({}) // Current accusations { accusedId: { name, accusers, voteCount } }
  const [eliminationCountdown, setEliminationCountdown] = useState(null) // { targetId, targetName, timeLeft }
  const [message, setMessage] = useState(null) // Added message state
  const [isEliminated, setIsEliminated] = useState(false) // Track if this player is eliminated
  const [eliminationInfo, setEliminationInfo] = useState(null) // Store elimination details
  const [gameEndData, setGameEndData] = useState(null) // Store game end data
  const [gameType, setGameType] = useState(null) // Store game type
  const [availableImages, setAvailableImages] = useState([]) // Available profile images
  const [currentProfileImage, setCurrentProfileImage] = useState(null) // Current profile image

  useEffect(() => {
    // Connect to Socket.IO server
    const newSocket = io('http://localhost:3002')
    setSocket(newSocket)

    // Get room info when component loads
    if (roomId) {
      newSocket.on('connect', () => {
        newSocket.emit(SOCKET_EVENTS.GET_ROOM_INFO, { roomId })
      })
    }

    // Check for auto-join URL parameters
    const urlParams = new URLSearchParams(window.location.search)
    const autoJoinPlayerName = urlParams.get('playerName')
    const shouldAutoJoin = urlParams.get('autoJoin') === 'true'

    if (shouldAutoJoin && autoJoinPlayerName && roomId) {
      // Auto-join with pre-filled data - wait for room info first
      console.log(`Auto-join detected: ${autoJoinPlayerName} -> ${roomId}`)
      setPlayerName(autoJoinPlayerName)
    }

    // Listen for join confirmation
    newSocket.on(SOCKET_EVENTS.PLAYER_JOINED, (data) => {
      if (data.success) {
        setPlayerId(data.playerId) // Set the player ID
        setIsWaiting(true)
        setIsJoining(false)
        setError('')
        setGameState(GAME_STATES.LOBBY)
        console.log('Joined successfully with ID:', data.playerId)
        setMessage(null) // Clear any old messages
      }
    })

    // Listen for role assignment
    newSocket.on(SOCKET_EVENTS.ROLE_ASSIGNED, (data) => {
      setPlayerRole(data.role)
      setGameState(GAME_STATES.ROLE_ASSIGNMENT)
      setIsReady(false)
      console.log('Role assigned:', data.role.name)
      setMessage(null) // Clear any old messages
    })

    // Listen for night phase start
    newSocket.on(SOCKET_EVENTS.START_NIGHT_PHASE, (data) => {
      setGameState(GAME_STATES.NIGHT_PHASE)
      setHasVoted(false)
      setSelectedTarget(null)
      setEliminatedPlayer(null)
      setMafiaVotesLocked(false) // Reset vote lock for new night
      // Reset Doctor actions
      setHasHealed(false)
      setSelectedHeal(null)
      setHealTargets([])
      // Reset Seer actions
      setHasInvestigated(false)
      setSelectedInvestigation(null)
      setInvestigateTargets([])
      setInvestigationResult(null)
      // Reset Mafia voting
      setVoteTargets([])
      setMafiaVotes({})
      setConsensusTimer(null)
      console.log('Night phase started!')
      setMessage(null) // Clear any old messages
    })

    // Listen for Mafia voting (only Mafia will receive this)
    newSocket.on(SOCKET_EVENTS.BEGIN_MAFIA_VOTE, (data) => {
      setVoteTargets(data.targets)
      console.log('Mafia voting started, targets:', data.targets)
      setMessage(null) // Clear any old messages
    })

    // Listen for night action completion
    newSocket.on(SOCKET_EVENTS.NIGHT_ACTION_COMPLETE, (data) => {
      setEliminatedPlayer(data.eliminatedPlayer)
      console.log('Night action completed:', data.eliminatedPlayer)
      setMessage(null) // Clear any old messages
    })

    // Listen for Mafia vote updates (real-time vote sharing)
    newSocket.on(SOCKET_EVENTS.MAFIA_VOTES_UPDATE, (data) => {
      setMafiaVotes(data.votes)
      console.log('Mafia votes updated:', data.votes)
      setMessage(null) // Clear any old messages
    })

    // Listen for consensus timer start
    newSocket.on(SOCKET_EVENTS.CONSENSUS_TIMER_START, (data) => {
      setConsensusTimer({
        targetId: data.targetId,
        targetName: data.targetName,
        timeLeft: Math.floor(data.duration / 1000) // Convert to seconds
      })
      console.log('Consensus timer started for:', data.targetName)
      setMessage(null) // Clear any old messages
    })

    // Listen for consensus timer cancelled
    newSocket.on(SOCKET_EVENTS.CONSENSUS_TIMER_CANCELLED, () => {
      setConsensusTimer(null)
      console.log('Consensus timer cancelled')
      setMessage(null) // Clear any old messages
    })

    // Listen for Mafia votes locked
    newSocket.on(SOCKET_EVENTS.MAFIA_VOTES_LOCKED, () => {
      setMafiaVotesLocked(true)
      console.log('Mafia votes are now locked')
      setMessage(null) // Clear any old messages
    })

    // Listen for Doctor action start (only Doctor will receive this)
    newSocket.on(SOCKET_EVENTS.BEGIN_DOCTOR_ACTION, (data) => {
      setHealTargets(data.targets)
      console.log('Doctor action started, heal targets:', data.targets)
      setMessage(null) // Clear any old messages
    })

    // Listen for Seer action start (only Seer will receive this)
    newSocket.on(SOCKET_EVENTS.BEGIN_SEER_ACTION, (data) => {
      setInvestigateTargets(data.targets)
      console.log('Seer action started, investigation targets:', data.targets)
      setMessage(null) // Clear any old messages
    })

    // Listen for Seer investigation result
    newSocket.on(SOCKET_EVENTS.SEER_RESULT, (data) => {
      setInvestigationResult(data.result)
      console.log('Investigation result received:', data.result)
      setMessage(null) // Clear any old messages
    })

    // Listen for day phase start
    newSocket.on(SOCKET_EVENTS.START_DAY_PHASE, (data) => {
      setGameState(GAME_STATES.DAY_PHASE)
      setDayPhaseTargets(data.alivePlayers)
      setAccusationTarget(null)
      setAccusations({})
      setEliminationCountdown(null)
      console.log('Day phase started, alive players:', data.alivePlayers)
      setMessage(null) // Clear any old messages
    })

    // Listen for accusation updates
    newSocket.on(SOCKET_EVENTS.ACCUSATIONS_UPDATE, (data) => {
      setAccusations(data.accusations)
      console.log('Accusations updated:', data.accusations)
      setMessage(null) // Clear any old messages
    })

    // Listen for elimination countdown
    newSocket.on(SOCKET_EVENTS.ELIMINATION_COUNTDOWN, (data) => {
      setEliminationCountdown({
        targetId: data.targetId,
        targetName: data.targetName,
        timeLeft: Math.floor(data.duration / 1000) // Convert to seconds
      })
      console.log('Elimination countdown started for:', data.targetName)
      setMessage(null) // Clear any old messages
    })

    // Listen for countdown cancelled
    newSocket.on(SOCKET_EVENTS.COUNTDOWN_CANCELLED, () => {
      setEliminationCountdown(null)
      console.log('Elimination countdown cancelled')
      setMessage(null) // Clear any old messages
    })

    // Listen for player elimination (general cleanup only)
    newSocket.on(SOCKET_EVENTS.PLAYER_ELIMINATED, (data) => {
      console.log('Player eliminated:', data.eliminatedPlayer)
      setEliminationCountdown(null)
      setAccusations({})
      setMessage(null) // Clear any old messages
      // Note: Individual player elimination check is handled in separate useEffect
    })

    // Listen for errors
    newSocket.on('error', (data) => {
      setError(data.message)
      setIsJoining(false)
      setMessage(null) // Clear any old messages
    })

    // Listen for game end
    newSocket.on(SOCKET_EVENTS.GAME_END, (data) => {
      console.log('Game ended:', data)
      setGameEndData(data)
      setGameState(GAME_STATES.ENDED)
      setMessage(null) // Clear any old messages
    })

    // Listen for room info
    newSocket.on(SOCKET_EVENTS.ROOM_INFO, (data) => {
      console.log('Room info received:', data)
      setGameType(data.gameType)
      setAvailableImages(data.availableImages)
      setCurrentProfileImage(data.defaultImage)
      
      // If this was an auto-join, automatically join now
      const urlParams = new URLSearchParams(window.location.search)
      const autoJoinPlayerName = urlParams.get('playerName')
      const shouldAutoJoin = urlParams.get('autoJoin') === 'true'
      
      if (shouldAutoJoin && autoJoinPlayerName && !isJoining) {
        setIsJoining(true)
        newSocket.emit(SOCKET_EVENTS.PLAYER_JOIN, {
          roomId: roomId,
          playerName: autoJoinPlayerName,
          profileImage: data.defaultImage
        })
      }
    })

    // Listen for game start (legacy - now handled by role assignment)
    newSocket.on(SOCKET_EVENTS.GAME_START, () => {
      console.log('Game is starting!')
      // This event is now replaced by ROLE_ASSIGNED
      setMessage(null) // Clear any old messages
    })

    // Cleanup on unmount
    return () => {
      if (newSocket) {
        newSocket.disconnect()
      }
    }
  }, [])

  // Separate effect to handle elimination events when playerId is available
  useEffect(() => {
    if (!socket || !playerId) return

    const handlePlayerElimination = (data) => {
      console.log('ELIMINATION EVENT:', {
        eliminatedId: data.eliminatedPlayer.id,
        eliminatedName: data.eliminatedPlayer.name,
        currentPlayerId: playerId,
        isMatch: data.eliminatedPlayer.id === playerId
      })
      
      if (data.eliminatedPlayer.id === playerId) {
        setIsEliminated(true)
        setEliminationInfo(data.eliminatedPlayer)
        console.log('You have been eliminated!')
      }
    }

    socket.on(SOCKET_EVENTS.PLAYER_ELIMINATED, handlePlayerElimination)

    return () => {
      socket.off(SOCKET_EVENTS.PLAYER_ELIMINATED, handlePlayerElimination)
    }
  }, [socket, playerId])

  // Countdown timer effect
  useEffect(() => {
    if (consensusTimer && consensusTimer.timeLeft > 0) {
      const timer = setTimeout(() => {
        setConsensusTimer(prev => prev ? { ...prev, timeLeft: prev.timeLeft - 1 } : null)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [consensusTimer])

  // Elimination countdown effect
  useEffect(() => {
    if (eliminationCountdown && eliminationCountdown.timeLeft > 0) {
      const timer = setTimeout(() => {
        setEliminationCountdown(prev => prev ? { ...prev, timeLeft: prev.timeLeft - 1 } : null)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [eliminationCountdown])

  const handleJoinRoom = (e) => {
    e.preventDefault()
    
    if (!validatePlayerName(playerName)) {
      setError('Name must be 2-20 characters long')
      return
    }

    if (!currentProfileImage) {
      setError('Please select a character image')
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
      roomId: roomId,
      profileImage: currentProfileImage
    })
  }

  const handleReady = () => {
    if (socket && !isReady) {
      socket.emit(SOCKET_EVENTS.PLAYER_READY, { roomId })
      setIsReady(true)
    }
  }

  const handleMafiaVote = (targetId) => {
    if (socket && !mafiaVotesLocked && !isEliminated) { // Prevent dead players from voting
      // Toggle vote off if clicking same target
      if (selectedTarget === targetId) {
        socket.emit(SOCKET_EVENTS.MAFIA_VOTE, { targetId: null })
        setSelectedTarget(null)
        setHasVoted(false)
        console.log('Removed vote')
        setMessage(null) // Clear any old messages
      } else {
        socket.emit(SOCKET_EVENTS.MAFIA_VOTE, { targetId })
        setSelectedTarget(targetId)
        setHasVoted(true)
        console.log('Voted for target:', targetId)
        setMessage(null) // Clear any old messages
      }
    }
  }

  const handleDoctorHeal = (targetId) => {
    if (socket && !hasHealed && !isEliminated) { // Prevent dead players from healing
      socket.emit(SOCKET_EVENTS.DOCTOR_HEAL, { targetId })
      setSelectedHeal(targetId)
      setHasHealed(true)
      console.log('Healed target:', targetId)
      setMessage(null) // Clear any old messages
    }
  }

  const handleSeerInvestigate = (targetId) => {
    if (socket && !hasInvestigated && !isEliminated) { // Prevent dead players from investigating
      socket.emit(SOCKET_EVENTS.SEER_INVESTIGATE, { targetId })
      setSelectedInvestigation(targetId)
      setHasInvestigated(true)
      console.log('Investigated target:', targetId)
      setMessage(null) // Clear any old messages
    }
  }

  const handleAccusation = (targetId) => {
    if (socket && !isEliminated) { // Prevent dead players from voting
      // Toggle accusation off if clicking same target
      if (accusationTarget === targetId) {
        socket.emit(SOCKET_EVENTS.PLAYER_ACCUSE, { targetId: null })
        setAccusationTarget(null)
        console.log('Cleared accusation')
        setMessage(null) // Clear any old messages
      } else {
        socket.emit(SOCKET_EVENTS.PLAYER_ACCUSE, { targetId })
        setAccusationTarget(targetId)
        console.log('Accused target:', targetId)
        setMessage(null) // Clear any old messages
      }
    }
  }





  // Show game end screen if game has ended
  if (gameState === GAME_STATES.ENDED && gameEndData) {
    const thisPlayer = gameEndData.allPlayers.find(p => p.id === playerId)
    const playerWon = thisPlayer && 
      ((gameEndData.winner === 'mafia' && thisPlayer.role.alignment === 'evil') ||
       (gameEndData.winner === 'villagers' && thisPlayer.role.alignment === 'good'))

    return (
      <div className="game-end-container">
        <div className="game-end-content">
          <div className={`victory-announcement ${gameEndData.winner}`}>
            <div className="victory-icon">
              {gameEndData.winner === 'mafia' ? '🔥' : '🏆'}
            </div>
            <h1>
              {gameEndData.winner === 'mafia' ? 'Mafia Victory!' : 'Villagers Victory!'}
            </h1>
            <p className="win-condition">{gameEndData.winCondition}</p>
          </div>

          <div className={`personal-result ${playerWon ? 'won' : 'lost'}`}>
            <h2>{playerWon ? '🎉 You Won!' : '💔 You Lost'}</h2>
            <div className="player-summary">
              <p>You played as: <strong style={{ color: thisPlayer?.role.color }}>
                {thisPlayer?.role.name}
              </strong></p>
              <p>Your alignment: <span className={`alignment-${thisPlayer?.role.alignment}`}>
                {thisPlayer?.role.alignment === 'good' ? '😇 Good' : '😈 Evil'}
              </span></p>
              <p>Status: <span className={thisPlayer?.alive ? 'alive-status' : 'dead-status'}>
                {thisPlayer?.alive ? '👑 Survived' : '💀 Eliminated'}
              </span></p>
            </div>
          </div>

          <div className="final-results">
            <h3>Final Results</h3>
            <div className="results-sections">
              <div className="survivors-section">
                <h4>👑 Survivors ({gameEndData.alivePlayers.length})</h4>
                <div className="players-list">
                  {gameEndData.alivePlayers.map(player => (
                    <div key={player.id} className="result-player alive">
                      <span className="player-name">{player.name}</span>
                      <span className="player-role" style={{ color: player.role.color }}>
                        {player.role.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="eliminated-section">
                <h4>💀 Eliminated ({gameEndData.allPlayers.filter(p => !p.alive).length})</h4>
                <div className="players-list">
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
          </div>

          <div className="room-info">
            <p>Room Code: <strong>{roomId}</strong></p>
            <p>Thanks for playing Werewolf Mafia!</p>
          </div>
        </div>
      </div>
    )
  }

  // Show eliminated player screen if this player is dead
  if (isEliminated && eliminationInfo) {
    return (
      <div className="eliminated-container">
        <div className="eliminated-content">
          <div className="eliminated-header">
            <div className="death-icon">💀</div>
            <h1>You Have Been Eliminated</h1>
            <p className="elimination-subtitle">Your time in this world has ended...</p>
          </div>

          <div className="elimination-details">
            <div className="player-info">
              <h2>Final Information</h2>
              <div className="info-card">
                <div className="info-row">
                  <span className="label">Player Name:</span>
                  <span className="value">{eliminationInfo.name}</span>
                </div>
                <div className="info-row">
                  <span className="label">Your Role:</span>
                  <span className="value" style={{ color: eliminationInfo.role?.color }}>
                    {eliminationInfo.role?.name || 'Unknown'}
                  </span>
                </div>
                <div className="info-row">
                  <span className="label">Alignment:</span>
                  <span className={`value alignment-${eliminationInfo.role?.alignment}`}>
                    {eliminationInfo.role?.alignment === 'good' ? '😇 Good' : '😈 Evil'}
                  </span>
                </div>
              </div>
            </div>

            <div className="spectator-info">
              <h3>👻 You are now a spectator</h3>
              <p>You can continue to watch the game unfold, but you cannot:</p>
              <ul>
                <li>• Vote during day phases</li>
                <li>• Use special abilities during night phases</li>
                <li>• Participate in discussions that affect the game</li>
              </ul>
              <p className="encouragement">
                Stay and watch to see if your team wins!
              </p>
            </div>

            <div className="room-info">
              <p>Room Code: <strong>{roomId}</strong></p>
              <p>Game continues with the remaining players...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Show day phase screen
  if (gameState === GAME_STATES.DAY_PHASE && playerRole) {
    // Filter out self, but show all players if filtering results in empty list (fallback)
    const votableTargets = dayPhaseTargets.filter(player => player.id !== playerId)
    const playersToShow = votableTargets.length > 0 ? votableTargets : dayPhaseTargets
    
    console.log('Day phase debug:', {
      playerId,
      totalTargets: dayPhaseTargets.length,
      votableTargets: votableTargets.length,
      playersToShow: playersToShow.length
    })
    
    return (
      <div className="day-phase-container">
        <div className="day-phase-content">
          <div className="day-header">
            <div className="day-icon">☀️</div>
            <h1>Day Phase</h1>
            <p className="role-reminder">You are: <strong style={{ color: playerRole.color }}>{playerRole.name}</strong></p>
          </div>

          <div className="voting-section">
            <h2>Discuss and Vote</h2>
            <p>Select a player to accuse and vote for elimination:</p>
            
                        <div className="player-list">
              {playersToShow.length > 0 ? (
                playersToShow.map((player) => (
                  <button
                    key={player.id}
                    className={`player-btn ${accusationTarget === player.id ? 'selected' : ''}`}
                    onClick={() => handleAccusation(player.id)}
                  >
                    <span className="player-name">{player.name}</span>
                    <div className="vote-info">
                      {accusationTarget === player.id && <span className="vote-indicator">✓ Accused</span>}
                      {accusations[player.id] && (
                        <span className="vote-count">({accusations[player.id].voteCount} votes)</span>
                      )}
                    </div>
                  </button>
                ))
              ) : (
                <div className="no-players">
                  <p>No players available to vote for</p>
                  <small>Debug: Total targets: {dayPhaseTargets.length}, Player ID: {playerId}</small>
                </div>
              )}
            </div>

            {accusationTarget && (
              <div className="accusation-confirmation">
                <p>You are accusing <strong>{playersToShow.find(p => p.id === accusationTarget)?.name}</strong></p>
                <div className="accusation-info">
                  <small>Click the same player again to clear your accusation</small>
                </div>
              </div>
            )}

            {eliminationCountdown && (
              <div className="elimination-timer">
                <h3>⚖️ Majority Reached!</h3>
                <p>Eliminating: <strong>{eliminationCountdown.targetName}</strong></p>
                <div className="countdown">
                  <span className="timer">{eliminationCountdown.timeLeft}</span>
                  <small>seconds to cancel</small>
                </div>
              </div>
            )}

            {Object.keys(accusations).length > 0 && !eliminationCountdown && (
              <div className="vote-summary">
                <h3>Current Accusations</h3>
                {Object.entries(accusations).map(([accusedId, accusationData]) => (
                  <div key={accusedId} className="accusation-item">
                    <span className="accused-name">{accusationData.name}:</span>
                    <span className="accusers">{accusationData.accusers.join(', ')}</span>
                    <span className="vote-count">({accusationData.voteCount} votes)</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Show night phase screen
  if (gameState === GAME_STATES.NIGHT_PHASE && playerRole) {
    // Mafia voting interface - check if this player is evil (Mafia/Werewolf)
    if (playerRole.alignment === 'evil') {
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
                    className={`target-btn ${selectedTarget === target.id ? 'selected' : ''} ${mafiaVotesLocked ? 'locked' : ''}`}
                    onClick={() => handleMafiaVote(target.id)}
                    disabled={mafiaVotesLocked}
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

              {hasVoted && !consensusTimer && !mafiaVotesLocked && (
                <div className="vote-confirmation">
                  <p>Vote cast! Click the same target again to remove your vote.</p>
                  <div className="consensus-info">
                    <small>All Mafia must agree for 5 seconds to lock in the target</small>
                  </div>
                </div>
              )}

              {mafiaVotesLocked && (
                <div className="vote-locked">
                  <p>🔒 Votes are locked! Waiting for other night actions to complete...</p>
                  <div className="locked-info">
                    <small>Your vote has been finalized and cannot be changed</small>
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

    // Doctor/Healer healing interface - check if this player is the protector
    const roleSet = gameType ? ROLE_SETS[gameType] : null
    if (roleSet && playerRole.name === roleSet.PROTECTOR.name) {
      // If we haven't received heal targets yet, show loading
      if (healTargets.length === 0) {
        return (
          <div className="doctor-heal-container">
            <div className="doctor-heal-content">
              <div className="night-header">
                <div className="night-icon">🌙</div>
                <h1>Night Phase</h1>
                <p className="role-reminder">You are: <strong style={{ color: playerRole.color }}>{playerRole.name}</strong></p>
              </div>

              <div className="heal-section">
                <h2>Preparing...</h2>
                <div className="night-progress">
                  <div className="night-spinner"></div>
                  <p>Gathering medical supplies...</p>
                </div>
              </div>
            </div>
          </div>
        )
      }

      return (
        <div className="doctor-heal-container">
          <div className="doctor-heal-content">
            <div className="night-header">
              <div className="night-icon">🌙</div>
              <h1>Night Phase</h1>
              <p className="role-reminder">You are: <strong style={{ color: playerRole.color }}>{playerRole.name}</strong></p>
            </div>

            <div className="heal-section">
              <h2>Choose Who to Protect</h2>
              <p>Select one player to save from a potential Mafia attack:</p>
              
              <div className="heal-list">
                {healTargets.map((target) => (
                  <button
                    key={target.id}
                    className={`heal-btn ${selectedHeal === target.id ? 'selected' : ''}`}
                    onClick={() => handleDoctorHeal(target.id)}
                    disabled={hasHealed}
                  >
                    <span className="heal-name">{target.name}</span>
                    {selectedHeal === target.id && <span className="heal-indicator">✅ Protected</span>}
                  </button>
                ))}
              </div>

              {hasHealed && (
                <div className="heal-confirmation">
                  <p>Protection cast! Waiting for other night actions...</p>
                  <div className="heal-info">
                    <small>Your choice is final and cannot be changed</small>
                  </div>
                </div>
              )}
            </div>

            {eliminatedPlayer && (
              <div className="elimination-result">
                <h3>Dawn Breaks</h3>
                <p><strong>{eliminatedPlayer.name}</strong> was found eliminated.</p>
              </div>
            )}
          </div>
        </div>
      )
    }

    // Seer/Detective investigation interface - check if this player is the investigator
    if (roleSet && playerRole.name === roleSet.INVESTIGATOR.name) {
      // If we haven't received investigation targets yet, show loading
      if (investigateTargets.length === 0) {
        return (
          <div className="seer-investigate-container">
            <div className="seer-investigate-content">
              <div className="night-header">
                <div className="night-icon">🌙</div>
                <h1>Night Phase</h1>
                <p className="role-reminder">You are: <strong style={{ color: playerRole.color }}>{playerRole.name}</strong></p>
              </div>

              <div className="investigate-section">
                <h2>Preparing...</h2>
                <div className="night-progress">
                  <div className="night-spinner"></div>
                  <p>Gathering clues...</p>
                </div>
              </div>
            </div>
          </div>
        )
      }

      return (
        <div className="seer-investigate-container">
          <div className="seer-investigate-content">
            <div className="night-header">
              <div className="night-icon">🌙</div>
              <h1>Night Phase</h1>
              <p className="role-reminder">You are: <strong style={{ color: playerRole.color }}>{playerRole.name}</strong></p>
            </div>

            {!hasInvestigated ? (
              <div className="investigate-section">
                <h2>Choose Who to Investigate</h2>
                <p>Select one player to learn their true alignment:</p>
                
                <div className="investigate-list">
                  {investigateTargets.map((target) => (
                    <button
                      key={target.id}
                      className={`investigate-btn ${selectedInvestigation === target.id ? 'selected' : ''}`}
                      onClick={() => handleSeerInvestigate(target.id)}
                      disabled={hasInvestigated}
                    >
                      <span className="investigate-name">{target.name}</span>
                      {selectedInvestigation === target.id && <span className="investigate-indicator">🔍 Investigating</span>}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="investigate-section">
                <h2>Investigation Complete</h2>
                
                {investigationResult && (
                  <div className="investigation-result">
                    <div className="result-content">
                      <div className="result-icon">🔍</div>
                      <p className="result-text">{investigationResult}</p>
                    </div>
                  </div>
                )}

                <div className="investigate-confirmation">
                  <p>Waiting for other night actions to complete...</p>
                  <div className="investigate-info">
                    <small>Your investigation is complete and private to you</small>
                  </div>
                </div>
              </div>
            )}

            {eliminatedPlayer && (
              <div className="elimination-result">
                <h3>Dawn Breaks</h3>
                <p><strong>{eliminatedPlayer.name}</strong> was found eliminated.</p>
              </div>
            )}
          </div>
        </div>
      )
    }

    // Regular citizens (Villager/Townsperson) night phase (waiting screen)
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
        {gameType && (
          <p className="game-type-info">Game Type: <strong>{gameType === GAME_TYPES.WEREWOLF ? 'Werewolf' : 'Mafia'}</strong></p>
        )}
        
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

          {gameType && availableImages.length > 0 && (
            <div className="form-group character-selection">
              <label>Choose Your Character</label>
              
              {/* Current Selection Preview */}
              {currentProfileImage && (
                <div className="current-selection">
                  <div className="current-avatar">
                    <img 
                      src={getProfileImageUrl(gameType, currentProfileImage)} 
                      alt="Current selection"
                      className="selected-profile-image"
                    />
                  </div>
                  <p className="selection-name">
                    {currentProfileImage?.replace(/\.(jpg|jpeg|png|gif)$/i, '').replace(/_/g, ' ')}
                  </p>
                </div>
              )}

              {/* Character Grid */}
              <div className="profile-grid">
                {availableImages.map(imageName => (
                  <div 
                    key={imageName}
                    className={`profile-option ${currentProfileImage === imageName ? 'selected' : ''}`}
                    onClick={() => setCurrentProfileImage(imageName)}
                  >
                    <img 
                      src={getProfileImageUrl(gameType, imageName)} 
                      alt={`Character ${imageName}`}
                      className="profile-option-image"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {error && <div className="error-message">{error}</div>}
          
          <button 
            type="submit" 
            className="join-btn"
            disabled={isJoining || !playerName.trim() || (gameType && !currentProfileImage)}
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