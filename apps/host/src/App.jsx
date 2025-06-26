import { Routes, Route } from 'react-router-dom'
import { useState, useEffect } from 'react'
import QRCode from 'qrcode.react'
import { io } from 'socket.io-client'
import { generateRoomId, SOCKET_EVENTS, GAME_CONFIG, GAME_STATES, GAME_TYPES, getProfileImageUrl, checkWebPSupport } from '@werewolf-mafia/shared'
import { HostGameStateManager } from './HostGameStateManager'

function GameLobby() {
  const [roomId, setRoomId] = useState(generateRoomId())
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
  const [imagesLoaded, setImagesLoaded] = useState(false)
  const [supportsWebP, setSupportsWebP] = useState(false)
  const [showDebugLinks, setShowDebugLinks] = useState(false)
  const [gamePaused, setGamePaused] = useState(false)
  const [pauseReason, setPauseReason] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [hostGameStateManager, setHostGameStateManager] = useState(null)

  // Environment-based URLs
  const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3002'
const PLAYER_APP_URL = import.meta.env.VITE_PLAYER_URL || 'http://localhost:3001'

  // Preload images
  useEffect(() => {
    // WebP detection
    const checkWebPSupport = () => {
      return new Promise((resolve) => {
        const webP = new Image()
        webP.onload = webP.onerror = () => {
          const isSupported = webP.height === 2
          if (isSupported) {
            document.documentElement.classList.add('webp')
          } else {
            document.documentElement.classList.add('no-webp')
          }
          resolve(isSupported)
        }
        webP.src = 'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA'
      })
    }

    const preloadImages = async () => {
      const supportsWebP = await checkWebPSupport()
      setSupportsWebP(supportsWebP)
      const imageExtension = supportsWebP ? '.webp' : '.png'
      
      const imagePromises = [
        `/images/WerewolfMainMenu${imageExtension}`,
        `/images/MafiaMainMenu${imageExtension}`
      ].map(src => {
        return new Promise((resolve, reject) => {
          const img = new Image()
          img.onload = resolve
          img.onerror = reject
          img.src = src
        })
      })
      
      try {
        await Promise.all(imagePromises)
        setImagesLoaded(true)
        console.log(`Loaded main menu images in ${imageExtension.slice(1).toUpperCase()} format`)
      } catch (error) {
        console.log('Some images failed to load:', error)
        setImagesLoaded(true) // Show interface anyway
      }
    }
    
    preloadImages()
  }, [])

  useEffect(() => {
    // Connect to Socket.IO server
    const hostSocket = io(SERVER_URL, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true,
      transports: ['websocket', 'polling']
    })
    setSocket(hostSocket)

    // Socket connection events
    hostSocket.on('connect', () => {
      console.log('Connected to game server')
      setConnectionStatus('connected')
      setMessage({ type: 'success', text: 'Connected to server' })
      setTimeout(() => setMessage(null), 3000)

      // Always join as host with existing room ID
      hostSocket.emit('host-room', { roomId })
      
      // Initialize host game state manager
      const gameStateManager = new HostGameStateManager(hostSocket, roomId)
      setHostGameStateManager(gameStateManager)
      console.log('HostGameStateManager initialized')
      
      // Set up player action handler using the local gameStateManager variable
      hostSocket.on('player-action', (action) => {
        console.log('Player action received by host:', action)
        
        try {
          switch (action.type) {
            case 'PLAYER_JOIN':
              gameStateManager.addPlayer(action.playerId, action.playerName, action.data.profileImage)
              break
              
            case 'PLAYER_READY':
              gameStateManager.playerReady(action.playerId)
              break
              
            case 'MAFIA_VOTE':
              gameStateManager.processMafiaVote(action.playerId, action.data.targetId)
              break
              
            case 'DOCTOR_HEAL':
              gameStateManager.processDoctorHeal(action.playerId, action.data.targetId)
              break
              
            case 'SEER_INVESTIGATE':
              gameStateManager.processSeerInvestigation(action.playerId, action.data.targetId)
              break
              
            case 'PLAYER_ACCUSE':
              gameStateManager.processDayVote(action.playerId, action.data.targetId)
              break
              
            default:
              console.log('Unknown player action type:', action.type)
          }
        } catch (error) {
          console.error('Error processing player action:', error)
          // Send error back to the player
          hostSocket.emit('host-send-to-player', {
            roomId: roomId,
            playerId: action.playerId,
            event: 'error',
            data: { message: error.message }
          })
        }
      })
      
      // Set up host action handler using the local gameStateManager variable
      hostSocket.on('host-action-confirmed', (action) => {
        console.log('Host action confirmed:', action)
        
        try {
          switch (action.type) {
            case 'GAME_START':
              gameStateManager.startGame()
              break
              
            default:
              console.log('Unknown host action type:', action.type)
          }
        } catch (error) {
          console.error('Error processing host action:', error)
          setMessage({ type: 'error', text: error.message })
          setTimeout(() => setMessage(null), 5000)
        }
      })
    })

    // Handle heartbeat
    hostSocket.on(SOCKET_EVENTS.HEARTBEAT, () => {
      hostSocket.emit(SOCKET_EVENTS.HEARTBEAT_RESPONSE)
    })

    hostSocket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason)
      setConnectionStatus('disconnected')
      setMessage({ 
        type: 'error', 
        text: 'Disconnected from server. Attempting to reconnect...' 
      })
    })

    // Listen for reconnect attempts
    hostSocket.on('reconnect_attempt', (attemptNumber) => {
      console.log('Attempting to reconnect:', attemptNumber)
      setConnectionStatus('connecting')
    })

    // Listen for successful reconnection
    hostSocket.on('reconnect', () => {
      console.log('Successfully reconnected')
      setConnectionStatus('connected')
      setMessage({ 
        type: 'success', 
        text: 'Reconnected to server' 
      })
      setTimeout(() => setMessage(null), 3000)

      // Re-join room and request current game state
      hostSocket.emit('host-room', { roomId, requestGameState: true })
    })

    // Listen for game state restoration after reconnect
    hostSocket.on('restore-game-state', (data) => {
      console.log('Restoring game state:', data)
      
      // Restore basic game state
      setGameState(data.gameState)
      setPlayers(data.players || [])
      setSelectedGameType(data.gameType)
      
      // Restore phase-specific state
      if (data.gameState === GAME_STATES.NIGHT_PHASE) {
        setEliminatedPlayer(data.eliminatedPlayer)
        setSavedPlayer(data.savedPlayer)
      } else if (data.gameState === GAME_STATES.DAY_PHASE) {
        // Convert accusations back to Map if needed
        const accusationsMap = new Map()
        if (data.accusations) {
          Object.entries(data.accusations).forEach(([key, value]) => {
            accusationsMap.set(key, new Set(value))
          })
        }
        setAccusations(accusationsMap)
        setEliminationCountdown(data.eliminationCountdown)
        setDayEliminatedPlayer(data.dayEliminatedPlayer)
      } else if (data.gameState === GAME_STATES.ROLE_ASSIGNMENT) {
        setPlayerReadiness(data.playerReadiness || [])
      } else if (data.gameState === GAME_STATES.ENDED && data.gameEndData) {
        setGameEndData(data.gameEndData)
      }

      // Update connection status
      setConnectionStatus('connected')
      setMessage({ 
        type: 'success', 
        text: 'Reconnected to server' 
      })
      setTimeout(() => setMessage(null), 3000)
    })

    // Listen for reconnect errors
    hostSocket.on('reconnect_error', (error) => {
      console.error('Reconnection error:', error)
      setMessage({ 
        type: 'error', 
        text: 'Failed to reconnect. Still trying...' 
      })
    })

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

    // Listen for game type selected - update state and clear any error messages
    hostSocket.on(SOCKET_EVENTS.GAME_TYPE_SELECTED, (gameType) => {
      console.log('Game type selected:', gameType)
      setSelectedGameType(gameType)
      setGameState(GAME_STATES.LOBBY)
      setMessage(null) // Clear any error messages
    })

    // Listen for master game state updates (truly host-authoritative system)
    hostSocket.on('game-state-update', (data) => {
      console.log('Master game state received by host:', data)
      
      // Host renders from the same master state as players
      if (data.gameState) {
        setGameState(data.gameState)
      }
      
      if (data.players) {
        setPlayers(data.players)
        
        // Set canStartGame based on player count and game state
        const canStart = data.players.length >= GAME_CONFIG.MIN_PLAYERS && data.gameState === GAME_STATES.LOBBY
        setCanStartGame(canStart)
        
        // For role assignment, extract playerReadiness from players
        if (data.gameState === GAME_STATES.ROLE_ASSIGNMENT) {
          const readinessData = data.players.map(p => ({
            id: p.id,
            name: p.name,
            ready: p.isReady,
            connected: p.connected,
            disconnectionInfo: p.disconnectionInfo
          }))
          setPlayerReadiness(readinessData)
        }
      }
      
      // Update other state from master state
      // Only set elimination data if it exists, otherwise clear it
      setEliminatedPlayer(data.eliminatedPlayer || null)
      setSavedPlayer(data.savedPlayer || null)
      if (data.dayEliminatedPlayer) {
        setDayEliminatedPlayer(data.dayEliminatedPlayer)
      }
      if (data.winner) {
        setGameEndData({
          winner: data.winner,
          winCondition: data.winCondition,
          alivePlayers: data.players?.filter(p => p.alive) || [],
          allPlayers: data.players || []
        })
      }
      
      // Convert accusations array back to object for UI
      if (data.accusations) {
        const accusationsObj = {}
        data.accusations.forEach(([accusedId, accusers]) => {
          const accusedPlayer = data.players?.find(p => p.id === accusedId)
          // Convert accuser IDs to names
          const accuserNames = accusers.map(accuserId => {
            const accuserPlayer = data.players?.find(p => p.id === accuserId)
            return accuserPlayer?.name || 'Unknown'
          })
          accusationsObj[accusedId] = {
            name: accusedPlayer?.name || 'Unknown',
            accusers: accuserNames,
            voteCount: accusers.length
          }
        })
        setAccusations(accusationsObj)
      }
      
      if (data.eliminationCountdown) {
        setEliminationCountdown(data.eliminationCountdown)
      }
      
      if (data.gamePaused !== undefined) {
        setGamePaused(data.gamePaused)
        setPauseReason(data.pauseReason || '')
      }
    })

    // Listen for game pause/resume events
    hostSocket.on(SOCKET_EVENTS.GAME_PAUSED, (data) => {
      console.log('Game paused:', data.reason)
      setGamePaused(true)
      setPauseReason(data.reason)
      setMessage({ 
        type: 'warning', 
        text: `Game paused: ${data.reason}. ${data.connectedPlayers}/${data.totalPlayers} players connected.` 
      })
    })

    hostSocket.on(SOCKET_EVENTS.GAME_RESUMED, () => {
      console.log('Game resumed')
      setGamePaused(false)
      setPauseReason('')
      setMessage({ type: 'success', text: 'Game resumed! All players reconnected.' })
      setTimeout(() => setMessage(null), 3000)
    })

    // Listen for player disconnections
    hostSocket.on(SOCKET_EVENTS.PLAYER_DISCONNECTED, (data) => {
      console.log('Player disconnected:', data.playerName)
      setMessage({ 
        type: 'warning', 
        text: `${data.playerName} disconnected. They have ${Math.floor(data.reconnectTimeLeft / 1000)}s to reconnect.` 
      })
      setTimeout(() => setMessage(null), 5000)
    })

    // Listen for errors
    hostSocket.on('error', (error) => {
      console.error('Socket error:', error.message)
    })

    // Cleanup on unmount or before reconnection
    return () => {
      if (hostSocket) {
        hostSocket.removeAllListeners()
        hostSocket.close()
      }
    }
  }, [roomId])

  // Elimination countdown effect
  useEffect(() => {
    if (eliminationCountdown && eliminationCountdown.timeLeft > 0) {
      const timer = setTimeout(() => {
        setEliminationCountdown(prev => prev ? { ...prev, timeLeft: prev.timeLeft - 1 } : null)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [eliminationCountdown])

  // Update disconnection timers during role assignment
  useEffect(() => {
    if (gameState === GAME_STATES.ROLE_ASSIGNMENT && playerReadiness.some(p => !p.connected)) {
      const timer = setInterval(() => {
        // Request updated readiness data from server to get fresh timers
        if (socket && roomId) {
          socket.emit('request-readiness-update', { roomId })
        }
      }, 1000)
      
      return () => clearInterval(timer)
    }
  }, [gameState, playerReadiness, socket, roomId])

  // Update disconnection timers during active gameplay phases
  useEffect(() => {
    let timer
    
    if ((gameState === GAME_STATES.NIGHT_PHASE || gameState === GAME_STATES.DAY_PHASE)) {
      // Check if any players are disconnected
      const hasDisconnectedPlayers = players.some(p => !p.connected)
      
      if (hasDisconnectedPlayers) {
        console.log('Starting timer updates for disconnected players during', gameState)
        timer = setInterval(() => {
          // Request updated player data from server to get fresh timers
          if (socket && roomId) {
            console.log('Requesting player update for timer refresh')
            socket.emit('request-player-update', { roomId })
          }
        }, 1000)
      }
    }
    
    return () => {
      if (timer) {
        console.log('Clearing disconnection timer updates')
        clearInterval(timer)
      }
    }
  }, [gameState, players.map(p => p.connected).join(','), socket, roomId]) // Use connection status as dependency

  const handleStartGame = () => {
    if (canStartGame && socket && hostGameStateManager) {
      // Send to server for validation, then server will confirm back to host
      socket.emit(SOCKET_EVENTS.GAME_START, { roomId })
      console.log('Requesting game start...')
    } else {
      console.log('Cannot start game:', { canStartGame, socket: !!socket, hostGameStateManager: !!hostGameStateManager })
    }
  }

  const autoFillPlayers = () => {
    const playerNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve']
    const baseUrl = PLAYER_APP_URL
    
    setShowDebugLinks(true)
    
    // Try to open tabs with user interaction context
    playerNames.forEach((name, index) => {
      const url = `${baseUrl}/join/${roomId}?playerName=${name}&autoJoin=true`
      
      // First two tabs: open immediately (usually allowed)
      if (index < 2) {
        setTimeout(() => {
          const opened = window.open(url, `_blank_player_${index}`)
          if (opened) {
            console.log(`✓ Opened tab for ${name}`)
          } else {
            console.log(`✗ Failed to open tab for ${name} - check pop-up blocker`)
          }
        }, index * 50)
      } else {
        // Remaining tabs: try with longer delays (might work if browser is lenient)
        setTimeout(() => {
          const opened = window.open(url, `_blank_player_${index}`)
          if (opened) {
            console.log(`✓ Opened tab for ${name}`)
          } else {
            console.log(`✗ Pop-up blocked for ${name}. Use the links below.`)
          }
        }, 500 + (index * 200))
      }
    })
    
    console.log('=== If some tabs were blocked, use these URLs ===')
    playerNames.forEach(name => {
      const url = `${baseUrl}/join/${roomId}?playerName=${name}&autoJoin=true`
      console.log(`${name}: ${url}`)
    })
  }

  const handleGameTypeSelect = (gameType) => {
    console.log('Game type selected:', gameType)
    
    if (hostGameStateManager) {
      hostGameStateManager.selectGameType(gameType)
      setSelectedGameType(gameType)
    } else {
      console.log('HostGameStateManager not available - cannot select game type')
      setMessage({ 
        type: 'error', 
        text: 'Game manager not ready. Please wait.' 
      })
    }
  }

  const qrCodeUrl = `${PLAYER_APP_URL}/join/${roomId}`

  // Add connection status indicator to all screens
  const renderConnectionStatus = () => {
    if (connectionStatus === 'connected') return null;

    return (
      <div className={`connection-status ${connectionStatus}`}>
        {connectionStatus === 'connecting' && '🔄 Connecting...'}
        {connectionStatus === 'disconnected' && '🔴 Attempting to reconnect...'}
      </div>
    );
  };

  // Wrap all screen returns with connection status
  const wrapWithConnectionStatus = (content) => {
    return (
      <>
        {renderConnectionStatus()}
        {content}
        {message && (
          <div className={`message ${message.type}`}>
            {message.text}
          </div>
        )}
      </>
    );
  };

  // Show main menu screen (before game type is selected)
  if (!selectedGameType) {
    return wrapWithConnectionStatus(
      <div className="main-menu-container">
        <div className="main-menu-header">
          <h1>🎭 Werewolf Mafia</h1>
          <h2>Room Code: {roomId}</h2>
        </div>
        
        <div className="main-menu-content">
          <div className="game-selection">
            <h3>Choose Your Game</h3>
            <p>Both games use the same mechanics but different themes and role names</p>
            
            {!imagesLoaded ? (
              <div className="loading-images">
                <div className="spinner"></div>
                <p>Loading game themes...</p>
              </div>
            ) : (
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
            )}
          </div>
        </div>
      </div>
    )
  }

  // Show game end screen
  if (gameState === GAME_STATES.ENDED && gameEndData) {
    return wrapWithConnectionStatus(
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
              {gameEndData.winner === 'mafia' ? 
                (selectedGameType === 'mafia' ? 'Mafia Victory!' : 'Werewolf Victory!') : 
                'Villagers Victory!'}
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
                <span className="stat-label">{selectedGameType === 'mafia' ? 'Mafia' : 'Werewolf'} Players:</span>
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

  // Show day phase screen
  if (gameState === GAME_STATES.DAY_PHASE) {
    return wrapWithConnectionStatus(
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
                          <span className="accusation-text">
                            {accusationData.accusers.join(', ')} accuses {accusationData.name} - {accusationData.voteCount} Votes
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="no-accusations">
                      <p>No accusations yet. Players are still discussing...</p>
                    </div>
                  )}
                  
                  {/* Show disconnected players during day phase */}
                  {players.some(p => !p.connected) && (
                    <div className="day-disconnections">
                      <h4>⚠️ Disconnected Players</h4>
                      {players.filter(p => !p.connected).map(player => (
                        <div key={player.id} className="day-disconnected-player">
                          <span className="player-name">{player.name}</span>
                          <span className="disconnection-status">
                            {player.disconnectionInfo 
                              ? `${player.disconnectionInfo.timeLeft}s to reconnect`
                              : 'Disconnected'}
                          </span>
                        </div>
                      ))}
                      <p className="disconnection-note">
                        Disconnected players cannot vote or be voted for
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {renderPauseOverlay()}
        </div>
      </div>
    )
  }

  // Show night phase screen
  if (gameState === GAME_STATES.NIGHT_PHASE) {
    return wrapWithConnectionStatus(
      <div className="night-container">
        <div className="night-header">
          <h1>Werewolf Mafia</h1>
          <h2>Room Code: {roomId}</h2>
        </div>
        
        <div className="night-content">
          <div className="night-icon">🌙</div>
          <h2>Night Phase</h2>
          <p>The town sleeps while the {selectedGameType === 'mafia' ? 'Mafia' : 'Werewolves'} make their move...</p>
          
          {eliminatedPlayer || savedPlayer ? (
            <div className="night-result">
              {eliminatedPlayer && (
                <div className="elimination-notice">
                  <h3>Night Action Complete</h3>
                  <p>
                    <strong>{eliminatedPlayer.name}</strong> was eliminated by the {selectedGameType === 'mafia' ? 'Mafia' : 'Werewolves'}.
                  </p>
                </div>
              )}
              
              {savedPlayer && (
                <div className="save-notice">
                  <h3>A Life Saved!</h3>
                  <p>
                    The {selectedGameType === 'mafia' ? 'Doctor' : 'Healer'} successfully saved someone from certain death!
                  </p>
                </div>
              )}
              
              {!eliminatedPlayer && savedPlayer && (
                <div className="no-elimination-notice">
                  <h3>No One Was Killed</h3>
                  <p>The {selectedGameType === 'mafia' ? 'Mafia' : 'Werewolves'} plan was thwarted by excellent medical intervention!</p>
                </div>
              )}
              
              <div className="next-phase-info">
                <p>The night phase is complete. Day phase coming soon...</p>
              </div>
            </div>
          ) : (
            <div className="night-progress">
              <div className="night-spinner"></div>
              <p>{selectedGameType === 'mafia' ? 'Mafia' : 'Werewolves'} selecting their target...</p>
              
              {/* Show game pause status or disconnected players during night phase */}
              {players.some(p => !p.connected) && (
                <div className="night-disconnections">
                  <h4>⚠️ Game Paused - Players Disconnected</h4>
                  {players.filter(p => !p.connected).map(player => (
                    <div key={player.id} className="night-disconnected-player">
                      <span className="player-name">{player.name}</span>
                      <span className="disconnection-status">
                        {player.disconnectionInfo 
                          ? `${player.disconnectionInfo.timeLeft}s to reconnect`
                          : 'Disconnected'}
                      </span>
                    </div>
                  ))}
                  <div className="disconnection-explanation">
                    <p className="disconnection-note">
                      <strong>🛑 Night phase is PAUSED</strong>
                    </p>
                    <ul className="pause-explanation-list">
                      <li>🔹 Game will wait for disconnected players to return</li>
                      <li>🔹 No actions will be skipped automatically</li>
                      <li>🔹 If players don't reconnect in time, the game will be invalidated</li>
                    </ul>
                    <p className="disconnection-note">
                      All players must be connected for the night phase to continue
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
          {renderPauseOverlay()}
        </div>
      </div>
    )
  }

  // Show waiting for players to confirm roles screen
  if (gameState === GAME_STATES.ROLE_ASSIGNMENT) {
    return wrapWithConnectionStatus(
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
                  <div key={player.id} className={`readiness-item ${!player.connected ? 'disconnected' : ''}`}>
                    <span className="readiness-status">
                      {!player.connected ? '🔴' : player.ready ? '✅' : '⏳'}
                    </span>
                    <div className="player-info">
                      <span className="player-name">{player.name}</span>
                      <span className="ready-text">
                        {!player.connected 
                          ? player.disconnectionInfo 
                            ? `Disconnected - ${player.disconnectionInfo.timeLeft}s to reconnect`
                            : 'Disconnected'
                          : player.ready 
                            ? 'Ready' 
                            : 'Reviewing role...'}
                      </span>
                      {!player.connected && player.disconnectionInfo && (
                        <div className="disconnection-warning">
                          ⚠️ Game will end if {player.name} doesn't reconnect in {player.disconnectionInfo.timeLeft}s
                        </div>
                      )}
                    </div>
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
          {renderPauseOverlay()}
        </div>
      </div>
    )
  }

  // Show in-progress screen placeholder
  if (gameState === GAME_STATES.IN_PROGRESS) {
    return wrapWithConnectionStatus(
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
  return wrapWithConnectionStatus(
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
                <div key={player.id} className={`player-item ${!player.connected ? 'player-disconnected' : ''}`}>
                  <span className="player-number">{index + 1}.</span>
                  {player.profileImage && selectedGameType && (
                    <div className="player-avatar">
                      <img 
                        src={getProfileImageUrl(selectedGameType, player.profileImage, supportsWebP)} 
                        alt={`${player.name}'s avatar`}
                        className="player-profile-image"
                        onError={(e) => {
                          if (supportsWebP && e.target.src.includes('.webp')) {
                            e.target.src = getProfileImageUrl(selectedGameType, player.profileImage, false)
                          }
                        }}
                      />
                    </div>
                  )}
                  <div className="player-details">
                    <span className="player-name">{player.name}</span>
                    {!player.connected && (
                      <span className="player-disconnection-note">Disconnected - attempting reconnection...</span>
                    )}
                  </div>
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
            <>
              <button 
                className="auto-fill-btn" 
                onClick={autoFillPlayers}
              >
                🚀 Auto-fill 5 Players
              </button>
              
              {showDebugLinks && (
                <div className="debug-links">
                  <h4>Debug Player Links (if pop-ups were blocked):</h4>
                  <div className="debug-links-list">
                    {['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'].map(name => {
                      const url = `${PLAYER_APP_URL}/join/${roomId}?playerName=${name}&autoJoin=true`
                      return (
                        <div key={name} className="debug-link-item">
                          <span className="player-debug-name">{name}:</span>
                          <a 
                            href={url} 
                            target={`_blank_player_${name}`}
                            className="debug-link"
                          >
                            Join as {name}
                          </a>
                        </div>
                      )
                    })}
                  </div>
                  <button 
                    className="hide-debug-btn" 
                    onClick={() => setShowDebugLinks(false)}
                  >
                    Hide Links
                  </button>
                </div>
              )}
            </>
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