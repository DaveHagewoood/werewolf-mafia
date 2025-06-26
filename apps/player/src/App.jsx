import { Routes, Route } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import { SOCKET_EVENTS, validatePlayerName, GAME_STATES, GAME_TYPES, PROFILE_IMAGES, getProfileImageUrl, ROLE_SETS, checkWebPSupport, PlayerConnectionState } from '@werewolf-mafia/shared'
import ConnectionManager from './utils/ConnectionManager'
import './App.css'

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
  const [supportsWebP, setSupportsWebP] = useState(false) // WebP support detection

  // Connection management
  const [connectionManager, setConnectionManager] = useState(null)
  const [connectionState, setConnectionState] = useState(PlayerConnectionState.CONNECTED)

  // New state for game pause/resume
  const [gamePaused, setGamePaused] = useState(false);
  const [pauseReason, setPauseReason] = useState('');

  // New state for reconnection attempts
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Helper function for simple error cleanup
  const handleConnectionError = (errorMessage) => {
    setError(errorMessage)
    setIsJoining(false)
    setIsWaiting(false)
    setMessage(null)
    
    // Reset states for fresh join attempt
    if (errorMessage.includes('not found') || errorMessage.includes('Game already in progress')) {
      setGameState('')
      setPlayerId('')
      setPlayerName('')
    }
  }

  useEffect(() => {
    // Check WebP support
    checkWebPSupport().then(setSupportsWebP)
    
    // Environment-based server URL
    const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3002'
    
    // Connect to Socket.IO server
    const newSocket = io(SERVER_URL, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    })

    // Create connection manager
    const manager = new ConnectionManager(
      newSocket,
      (newState) => {
        setConnectionState(newState)
        if (newState === PlayerConnectionState.PAUSED) {
          setError('Connection lost. Game paused. Click to try reconnecting.')
        } else if (newState === PlayerConnectionState.ATTEMPTING_RECONNECTION) {
          setError('Attempting to reconnect...')
        }
      },
      (gameState) => {
        // Handle successful reconnection
        console.log('Reconnection successful, restoring game state:', gameState)
        setConnectionState(PlayerConnectionState.CONNECTED)
        setError(null)
        
        // Restore game state
        setGameState(gameState.gameState)
        if (gameState.role) {
          setPlayerRole(gameState.role)
        }
        setIsReady(gameState.isReady || false)
        
        // Show success message briefly
        setMessage({ type: 'success', text: 'Reconnected successfully!' })
        setTimeout(() => setMessage(null), 3000)
      },
      (reason) => {
        // Handle failed reconnection
        console.log('Reconnection failed:', reason)
        setError('Failed to reconnect. Click to try again.')
      }
    )
    
    setSocket(newSocket)
    setConnectionManager(manager)

    // Get room info when component loads
    if (roomId) {
      newSocket.on('connect', () => {
        newSocket.emit(SOCKET_EVENTS.GET_ROOM_INFO, { roomId })
      })
    }

    // Handle heartbeat
    newSocket.on(SOCKET_EVENTS.HEARTBEAT, () => {
      newSocket.emit(SOCKET_EVENTS.HEARTBEAT_RESPONSE)
    })

    // Check for auto-join URL parameters
    const urlParams = new URLSearchParams(window.location.search)
    const autoJoinPlayerName = urlParams.get('playerName')
    const shouldAutoJoin = urlParams.get('autoJoin') === 'true'

    if (shouldAutoJoin && autoJoinPlayerName && roomId) {
      console.log(`Auto-join detected: ${autoJoinPlayerName} -> ${roomId}`)
      setPlayerName(autoJoinPlayerName)
    }

    // Listen for role assignment
    newSocket.on(SOCKET_EVENTS.ROLE_ASSIGNED, (data) => {
      console.log('Role assigned event received:', data.role.name)
      setPlayerRole(data.role)
      setGameState(GAME_STATES.ROLE_ASSIGNMENT)
      
      // Only reset readiness if this is a fresh role assignment (not a reconnection re-send)
      if (!playerRole) {
        console.log('Fresh role assignment - resetting readiness')
        setIsReady(false)
      } else {
        console.log('Role re-sent during reconnection - preserving readiness state')
      }
      
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

    // Listen for successful player join
    newSocket.on(SOCKET_EVENTS.PLAYER_JOINED, (data) => {
      console.log('=== PLAYER_JOINED EVENT RECEIVED ===')
      console.log('Full event data received:', JSON.stringify(data, null, 2))
      console.log('data.playerId type:', typeof data.playerId, 'value:', data.playerId)
      console.log('data.playerName type:', typeof data.playerName, 'value:', data.playerName)
      console.log('data.success:', data.success)
      console.log('data.reconnectToken:', data.reconnectToken ? 'present' : 'missing')
      
      if (!data.playerId) {
        console.error('ERROR: playerId is missing from PLAYER_JOINED event!', data)
      }
      if (!data.playerName) {
        console.error('ERROR: playerName is missing from PLAYER_JOINED event!', data)
      }
      
      setPlayerId(data.playerId)
      setPlayerName(data.playerName)
      setIsJoining(false)
      setIsWaiting(true)
      setMessage(null) // Clear any old messages
      console.log('=== PLAYER_JOINED PROCESSING COMPLETE ===')
      console.log('State after setting - playerId:', data.playerId, 'playerName:', data.playerName)
    })

    // Listen for game start (legacy - now handled by role assignment)
    newSocket.on(SOCKET_EVENTS.GAME_START, () => {
      console.log('Game is starting!')
      // This event is now replaced by ROLE_ASSIGNED
      setMessage(null) // Clear any old messages
    })

    // Listen for game pause/resume events
    newSocket.on(SOCKET_EVENTS.GAME_PAUSED, (data) => {
      console.log('Game paused:', data.reason);
      setGamePaused(true);
      setPauseReason(data.reason);
      setError(data.reason);
    });

    newSocket.on(SOCKET_EVENTS.GAME_RESUMED, () => {
      console.log('Game resumed');
      setGamePaused(false);
      setPauseReason('');
      setError(null);
      setMessage({ type: 'success', text: 'Game resumed!' });
      setTimeout(() => setMessage(null), 3000);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      
      // If in lobby, just show error and let server remove the player
      if (gameState === GAME_STATES.LOBBY) {
        console.log('Disconnected from lobby - will be removed by server');
        setIsWaiting(false);
        setError('Connection lost. Please rejoin the game.');
        return;
      }
      
      // Only attempt reconnection for active game phases
      if (gameState !== GAME_STATES.ENDED) {
        console.log('Disconnected during game - attempting to reconnect');
        setConnectionState(PlayerConnectionState.ATTEMPTING_RECONNECTION);
        setError('Connection lost during game. Please wait for reconnection.');
        
        // Attempt to reconnect after a short delay
        setTimeout(() => {
          setReconnectAttempts(prev => prev + 1);
        }, 1000);
      }
    });



    // Handle errors
    newSocket.on('error', (data) => {
      setError(data.message);
      if (isJoining) {
        setIsJoining(false);
      }
    });

    return () => {
      manager.cleanup()
      newSocket.close()
    }
  }, [])

  // Separate effect to handle game state updates with current playerId/playerName
  useEffect(() => {
    if (!socket) return;

    const handleGameStateUpdate = (masterState) => {
      console.log('🔍 CLIENT DEBUG - Game state update received');
      console.log('🔍 CLIENT DEBUG - Current playerId:', playerId);
      console.log('🔍 CLIENT DEBUG - Current playerName:', playerName);
      console.log('🔍 CLIENT DEBUG - Players in state:', masterState.players?.map(p => ({
        id: p.id,
        name: p.name,
        alive: p.alive
      })));
      
      // If we don't have a playerId yet, try to find ourselves in the player list
      let currentPlayer = null;
      if (playerId) {
        currentPlayer = masterState.players?.find(p => p.id === playerId);
        console.log('Found player by ID:', currentPlayer);
      } else if (playerName && playerName.trim()) {
        // If no playerId, try to find by name as fallback (for state updates before PLAYER_JOINED)
        currentPlayer = masterState.players?.find(p => p.name === playerName.trim());
        if (currentPlayer) {
          console.log('Found player by name, setting playerId:', currentPlayer.id);
          setPlayerId(currentPlayer.id);
          setPlayerName(currentPlayer.name); // Ensure name is synced
        }
      } else {
        console.log('No playerId or playerName available, cannot identify current player');
      }
      
      if (!currentPlayer) {
        console.log('🚨 CLIENT DEBUG - Current player NOT FOUND in state!');
        console.log('🚨 CLIENT DEBUG - playerId:', playerId, 'playerName:', playerName);
        console.log('🚨 CLIENT DEBUG - Available players:', masterState.players?.map(p => `${p.name}(${p.id})`));
        // Still update basic state even if we can't find current player
        setGameState(masterState.gameState);
        setGamePaused(masterState.gamePaused);
        setPauseReason(masterState.pauseReason);
        return;
      }
      
      console.log('✅ CLIENT DEBUG - Current player found:', {
        id: currentPlayer.id,
        name: currentPlayer.name,
        alive: currentPlayer.alive,
        role: currentPlayer.role?.name
      });
      
      // Update basic state
      setGameState(masterState.gameState);
      setGamePaused(masterState.gamePaused);
      setPauseReason(masterState.pauseReason);
      
      // Update phase-specific state
      console.log('GAME STATE HANDLER - masterState.gameState:', masterState.gameState);
      console.log('GAME STATE HANDLER - masterState.gameType:', masterState.gameType);
      console.log('GAME STATE HANDLER - setting gameState to:', masterState.gameState);
      console.log('GAME STATE HANDLER - setting gameType to:', masterState.gameType);
      setGameState(masterState.gameState);
      setGameType(masterState.gameType);
      
      switch (masterState.gameState) {
        case GAME_STATES.ROLE_ASSIGNMENT:
          if (currentPlayer) {
            console.log('ROLE_ASSIGNMENT - setting playerRole to:', currentPlayer.role);
            setPlayerRole(currentPlayer.role);
            setIsReady(currentPlayer.isReady);
          }
          break;
          
        case GAME_STATES.NIGHT_PHASE:
          if (currentPlayer) {
            setPlayerRole(currentPlayer.role);
            setIsEliminated(!currentPlayer.alive);
            
            // Set eliminationInfo for dead players from enhanced state
            if (!currentPlayer.alive) {
              setEliminationInfo({
                id: currentPlayer.id,
                name: currentPlayer.name,
                role: currentPlayer.role
              });
            }
            
            setEliminatedPlayer(masterState.eliminatedPlayer);
            
            // Set available targets based on role
            if (masterState.availableTargets && currentPlayer.role) {
              console.log('Setting targets for role:', currentPlayer.role);
              if (currentPlayer.role.alignment === 'evil') {
                console.log('Setting mafia targets:', masterState.availableTargets.mafia);
                setVoteTargets(masterState.availableTargets.mafia || []);
              } else if (currentPlayer.role.name === 'Doctor' || currentPlayer.role.name === 'Healer') {
                console.log('Doctor role detected, available targets:', masterState.availableTargets.doctor);
                console.log('Doctor targets type:', typeof masterState.availableTargets.doctor);
                console.log('Doctor targets length:', masterState.availableTargets.doctor?.length);
                console.log('Doctor targets content:', JSON.stringify(masterState.availableTargets.doctor, null, 2));
                const doctorTargets = masterState.availableTargets.doctor || [];
                setHealTargets(doctorTargets);
                console.log('setHealTargets called with:', doctorTargets.length, 'targets');
              } else if (currentPlayer.role.name === 'Seer' || currentPlayer.role.name === 'Detective') {
                console.log('Seer/Detective role detected, available targets:', masterState.availableTargets.seer);
                console.log('Seer targets type:', typeof masterState.availableTargets.seer);
                console.log('Seer targets length:', masterState.availableTargets.seer?.length);
                console.log('Seer targets content:', JSON.stringify(masterState.availableTargets.seer, null, 2));
                const seerTargets = masterState.availableTargets.seer || [];
                setInvestigateTargets(seerTargets);
                console.log('setInvestigateTargets called with:', seerTargets.length, 'targets');
              }
            } else {
              console.log('No available targets or role in master state');
            }
            
            // Update voting state from master state
            const mafiaVotesArray = masterState.mafiaVotes || [];
            const currentVotes = mafiaVotesArray.map(([voterId, targetId]) => {
              const voter = masterState.players.find(p => p.id === voterId);
              const target = masterState.players.find(p => p.id === targetId);
              return {
                voterId,
                voterName: voter?.name || 'Unknown',
                targetId,
                targetName: target?.name || 'Unknown'
              };
            });
            setMafiaVotes(currentVotes);
            
            // Find current player's selected target
            const playerVote = mafiaVotesArray.find(([voterId]) => voterId === playerId);
            setSelectedTarget(playerVote ? playerVote[1] : null);
            setHasVoted(!!playerVote);
            setMafiaVotesLocked(masterState.mafiaVotesLocked || false);
            setConsensusTimer(masterState.consensusTimer || null);
            
            // Update heal state from master state
            const healActionsArray = masterState.healActions || [];
            const playerHeal = healActionsArray.find(([healerId]) => healerId === playerId);
            setSelectedHeal(playerHeal ? playerHeal[1] : null);
            setHasHealed(!!playerHeal);
            
            // Update investigation state from master state
            const investigationActionsArray = masterState.investigationActions || [];
            const playerInvestigation = investigationActionsArray.find(([investigatorId]) => investigatorId === playerId);
            setSelectedInvestigation(playerInvestigation ? playerInvestigation[1] : null);
            setHasInvestigated(!!playerInvestigation);
            
            // Update investigation result
            const investigationResultsArray = masterState.investigationResults || [];
            const playerResult = investigationResultsArray.find(([investigatorId]) => investigatorId === playerId);
            setInvestigationResult(playerResult ? playerResult[1] : null);
          }
          break;
          
        case GAME_STATES.DAY_PHASE:
          if (currentPlayer) {
            console.log('🔍 DAY_PHASE DEBUG - Processing player state:');
            console.log('🔍 DAY_PHASE DEBUG - currentPlayer.alive:', currentPlayer.alive);
            console.log('🔍 DAY_PHASE DEBUG - Setting isEliminated to:', !currentPlayer.alive);
            
            setPlayerRole(currentPlayer.role);
            setIsEliminated(!currentPlayer.alive);
            
            // Set eliminationInfo for dead players from enhanced state
            if (!currentPlayer.alive) {
              const elimInfo = {
                id: currentPlayer.id,
                name: currentPlayer.name,
                role: currentPlayer.role
              };
              setEliminationInfo(elimInfo);
              console.log('🔍 DAY_PHASE DEBUG - Set eliminationInfo for dead player:', elimInfo);
            } else {
              console.log('🔍 DAY_PHASE DEBUG - Player is alive, clearing eliminationInfo');
              setEliminationInfo(null);
            }
            
            setAccusations(masterState.accusations);
            setEliminationCountdown(masterState.eliminationCountdown);
            
            // Set day phase targets (all alive players for voting)
            const alivePlayers = masterState.players.filter(p => p.alive);
            setDayPhaseTargets(alivePlayers);
          }
          break;
          
        case GAME_STATES.ENDED:
          setGameEndData(masterState);
          break;
      }
    };

    socket.on('game-state-update', handleGameStateUpdate);

    return () => {
      socket.off('game-state-update', handleGameStateUpdate);
    };
  }, [socket, playerId, playerName]); // This useEffect will re-run when playerId/playerName change

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

    console.log('=== SENDING PLAYER_JOIN EVENT ===')
    console.log('playerName:', playerName.trim())
    console.log('roomId:', roomId)
    console.log('profileImage:', currentProfileImage)
    console.log('socket connected:', socket.connected)
    console.log('socket id:', socket.id)

    // Emit join event to server
    socket.emit(SOCKET_EVENTS.PLAYER_JOIN, {
      playerName: playerName.trim(),
      roomId: roomId,
      profileImage: currentProfileImage
    })
    
    console.log('=== PLAYER_JOIN EVENT SENT ===')
    
    // Add a timeout to catch if PLAYER_JOINED never comes back
    setTimeout(() => {
      if (isJoining) {
        console.error('TIMEOUT: PLAYER_JOINED event never received after 10 seconds')
        console.log('Socket status - connected:', socket.connected, 'id:', socket.id)
      }
    }, 10000)
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
        console.log('Removed vote')
      } else {
        socket.emit(SOCKET_EVENTS.MAFIA_VOTE, { targetId })
        console.log('Voted for target:', targetId)
      }
      setMessage(null) // Clear any old messages
    }
  }

  const handleDoctorHeal = (targetId) => {
    if (socket && !hasHealed && !isEliminated) { // Prevent dead players from healing
      socket.emit(SOCKET_EVENTS.DOCTOR_HEAL, { targetId })
      console.log('Healed target:', targetId)
      setMessage(null) // Clear any old messages
    }
  }

  const handleSeerInvestigate = (targetId) => {
    if (socket && !hasInvestigated && !isEliminated) { // Prevent dead players from investigating
      socket.emit(SOCKET_EVENTS.SEER_INVESTIGATE, { targetId })
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

  // Show game end screen
  if (gameState === GAME_STATES.ENDED && gameEndData) {
    // For host disconnects, show a simple message
    if (!gameEndData.winner) {
      return (
        <div className="disconnect-container">
          <div className="disconnect-content">
            <div className="disconnect-icon">⚠️</div>
            <h1>Game Ended</h1>
            <p>{gameEndData.winCondition}</p>
            <p className="reconnect-message">Please scan a new QR code to join another game.</p>
          </div>
        </div>
      );
    }

    // For normal game endings, show the full results
    return (
      <div className="game-end-container">
        <div className="game-end-header">
          <h1>Game Over</h1>
          <div className={`victory-announcement ${gameEndData.winner}`}>
            <div className="victory-icon">
              {gameEndData.winner === 'mafia' ? '🔥' : '🏆'}
            </div>
            <h2>
              {gameEndData.winner === 'mafia' ? 'Mafia Victory!' : 'Villagers Victory!'}
            </h2>
          </div>
          <p className="win-condition">{gameEndData.winCondition}</p>
        </div>

        <div className="game-end-content">
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
        </div>
      </div>
    );
  }

  // Add pause overlay to all game phase screens
  const renderPauseOverlay = () => {
    if (!gamePaused) return null;

    return (
      <div className="pause-overlay">
        <div className="pause-content">
          <h2>⚠️ Game Paused</h2>
          <p>{pauseReason}</p>
          {pauseReason === 'Host disconnected' && (
            <div className="host-disconnect-warning">
              <p>Game will end in 15 seconds if host doesn't reconnect</p>
              <div className="reconnect-spinner"></div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Add pause overlay to all game phase views
  const wrapWithPauseOverlay = (content) => {
    return (
      <>
        {content}
        {renderPauseOverlay()}
      </>
    );
  };

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
    
    return wrapWithPauseOverlay(
      <div className="day-container">
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
      </div>
    )
  }

  // Show night phase screen
  console.log('UI MAIN DEBUG - gameState:', gameState);
  console.log('UI MAIN DEBUG - GAME_STATES.NIGHT_PHASE:', GAME_STATES.NIGHT_PHASE);
  console.log('UI MAIN DEBUG - gameState === GAME_STATES.NIGHT_PHASE:', gameState === GAME_STATES.NIGHT_PHASE);
  console.log('UI MAIN DEBUG - playerRole:', playerRole);
  console.log('UI MAIN DEBUG - night phase condition result:', gameState === GAME_STATES.NIGHT_PHASE && playerRole);
  
  if (gameState === GAME_STATES.NIGHT_PHASE && playerRole) {
    // Mafia voting interface - check if this player is evil (Mafia/Werewolf)
    if (playerRole.alignment === 'evil') {
      // If we haven't received vote targets yet, show loading
      if (voteTargets.length === 0) {
        return wrapWithPauseOverlay(
          <div className="night-container">
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
          </div>
        )
      }
      return wrapWithPauseOverlay(
        <div className="night-container">
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
        </div>
      )
    }

    // Doctor/Healer healing interface - check if this player is the protector
    const roleSet = gameType ? ROLE_SETS[gameType] : null
    console.log('UI Debug - Game type:', gameType);
    console.log('UI Debug - Role set:', roleSet);
    console.log('UI Debug - Player role name:', playerRole.name);
    console.log('UI Debug - Expected protector name:', roleSet?.PROTECTOR?.name);
    console.log('UI Debug - Names match:', playerRole.name === roleSet?.PROTECTOR?.name);
    
    if (roleSet && playerRole.name === roleSet.PROTECTOR.name) {
      // If we haven't received heal targets yet, show loading
      if (healTargets.length === 0) {
        return wrapWithPauseOverlay(
          <div className="night-container">
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
          </div>
        )
      }

      return wrapWithPauseOverlay(
        <div className="night-container">
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
        </div>
      )
    }

    // Seer/Detective investigation interface - check if this player is the investigator
    console.log('UI Debug - Investigator check - Player role name:', playerRole.name);
    console.log('UI Debug - Investigator check - Expected investigator name:', roleSet?.INVESTIGATOR?.name);
    console.log('UI Debug - Investigator check - Names match:', playerRole.name === roleSet?.INVESTIGATOR?.name);
    
    if (roleSet && playerRole.name === roleSet.INVESTIGATOR.name) {
      // If we haven't received investigation targets yet, show loading
      if (investigateTargets.length === 0) {
        return wrapWithPauseOverlay(
          <div className="night-container">
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
          </div>
        )
      }

      return wrapWithPauseOverlay(
        <div className="night-container">
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
        </div>
      )
    }

    // Regular citizens (Villager/Townsperson) night phase (waiting screen)
    return wrapWithPauseOverlay(
      <div className="night-container">
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
      </div>
    )
  }

  // Show role assignment screen
  if (gameState === GAME_STATES.ROLE_ASSIGNMENT) {
    // If we don't have role data yet, show loading screen
    if (!playerRole) {
      console.log('Role assignment phase detected but no player role yet - showing loading')
      return wrapWithPauseOverlay(
        <div className="role-container">
          <div className="role-content">
            <div className="role-header">
              <h1>Preparing Your Role...</h1>
            </div>
            <div className="role-loading">
              <div className="spinner"></div>
              <p>Retrieving your secret role assignment...</p>
              <div className="loading-fallback">
                <p style={{ fontSize: '14px', marginTop: '20px', color: '#666' }}>
                  If this takes too long, try refreshing the page to reconnect
                </p>
              </div>
            </div>
          </div>
        </div>
      )
    }
    return wrapWithPauseOverlay(
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
    return wrapWithPauseOverlay(
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
    return wrapWithPauseOverlay(
      <div className="waiting-container">
        <div className="waiting-content">
          <div className="spinner"></div>
          {error ? (
            <>
              <h2>Connection Error</h2>
              <p>{error}</p>
              <button 
                onClick={() => {
                  setError('')
                  setIsWaiting(false)
                }}
              >
                Try Again
              </button>
            </>
          ) : (
            <>
              <h2>You're in the game!</h2>
              <p>Room: <strong>{roomId}</strong></p>
              <p>Waiting for the host to start the game...</p>
              <div className="player-info">
                <span className="player-name">Playing as: {playerName}</span>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // Show join form
  return wrapWithPauseOverlay(
    <div className="app-wrapper">
      {/* Connection Status Indicator */}
      {connectionState !== PlayerConnectionState.CONNECTED && (
        <div className={`connection-status ${connectionState.toLowerCase()}`}>
          {connectionState === PlayerConnectionState.ATTEMPTING_RECONNECTION && '🔄 Reconnecting...'}
          {connectionState === PlayerConnectionState.PAUSED && '🔴 Connection Lost'}
          {connectionState === PlayerConnectionState.DISCONNECTED && '⚫ Disconnected'}
        </div>
      )}
      
      {/* Message Display */}
      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}
      
      {/* Only show join form if connected */}
      {connectionState === PlayerConnectionState.CONNECTED && (
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
                          src={getProfileImageUrl(gameType, currentProfileImage, supportsWebP)} 
                          alt="Current selection"
                          className="selected-profile-image"
                          onError={(e) => {
                            if (supportsWebP && e.target.src.includes('.webp')) {
                              e.target.src = getProfileImageUrl(gameType, currentProfileImage, false)
                            }
                          }}
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
                          src={getProfileImageUrl(gameType, imageName, supportsWebP)} 
                          alt={`Character ${imageName}`}
                          className="profile-option-image"
                          onError={(e) => {
                            if (supportsWebP && e.target.src.includes('.webp')) {
                              e.target.src = getProfileImageUrl(gameType, imageName, false)
                            }
                          }}
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
      )}
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