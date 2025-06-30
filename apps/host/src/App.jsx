import { Routes, Route } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode.react'
import { io } from 'socket.io-client'
import { generateRoomId, SOCKET_EVENTS, GAME_CONFIG, GAME_STATES, GAME_TYPES, getProfileImageUrl, checkWebPSupport, getThemeList, getTheme, EVIL_THEMES, POWERS } from '@werewolf-mafia/shared'
import { HostGameStateManager } from './HostGameStateManager'
import './App.css'

function GameLobby() {
  const [roomId, setRoomId] = useState(generateRoomId())
  const [players, setPlayers] = useState([])
  const [canStartGame, setCanStartGame] = useState(false)
  const [socket, setSocket] = useState(null)
  const [gameState, setGameState] = useState(GAME_STATES.LOBBY)
  const [playerReadiness, setPlayerReadiness] = useState([])
  const [eliminatedPlayer, setEliminatedPlayer] = useState(null)
  const [savedPlayer, setSavedPlayer] = useState(null)
  const [mostSuspiciousPlayer, setMostSuspiciousPlayer] = useState(null)
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
  const [introStory, setIntroStory] = useState(null)
  const previousIntroStoryRef = useRef(null)
  const [isDisplayingStory, setIsDisplayingStory] = useState(false)

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
      // Create callback to update React state when HostGameStateManager state changes
      const handleStateChange = (newGameState) => {
        // Only log story-related state changes or major transitions
        if (newGameState.gameState !== gameState || newGameState.introStory !== undefined) {
          console.log('HostGameStateManager state changed:', newGameState.gameState);
        }
        
        // Update React state from HostGameStateManager state
        setGameState(newGameState.gameState);
        setPlayers(newGameState.players);
        setSelectedGameType(newGameState.gameType);
        
        // Update phase-specific state
        if (newGameState.gameState === GAME_STATES.ROLE_ASSIGNMENT) {
          const readinessData = newGameState.players.map(p => ({
            id: p.id,
            name: p.name,
            ready: p.isReady || false,
            connected: p.connected,
            disconnectionInfo: p.disconnectionInfo
          }));
          setPlayerReadiness(readinessData);
        }
        
        // Update lobby state
        if (newGameState.gameState === GAME_STATES.LOBBY) {
          setCanStartGame(newGameState.players.length >= GAME_CONFIG.MIN_PLAYERS);
        }
        
        // Note: Story intro state is now handled via temporary display callback, not game state
        
        // Update game-specific state
        if (newGameState.eliminatedPlayer !== undefined) {
          setEliminatedPlayer(newGameState.eliminatedPlayer);
        }
        if (newGameState.savedPlayer !== undefined) {
          setSavedPlayer(newGameState.savedPlayer);
        }
        if (newGameState.mostSuspiciousPlayer !== undefined) {
          setMostSuspiciousPlayer(newGameState.mostSuspiciousPlayer);
        }
        if (newGameState.dayEliminatedPlayer !== undefined) {
          setDayEliminatedPlayer(newGameState.dayEliminatedPlayer);
        }
        if (newGameState.accusations !== undefined) {
          // Convert accusations from HostGameStateManager format to UI format
          const accusationsObj = {};
          newGameState.accusations.forEach(([accusedId, accusers]) => {
            const accusedPlayer = newGameState.players.find(p => p.id === accusedId);
            const accuserNames = accusers.map(accuserId => {
              const accuserPlayer = newGameState.players.find(p => p.id === accuserId);
              return accuserPlayer?.name || 'Unknown';
            });
            accusationsObj[accusedId] = {
              name: accusedPlayer?.name || 'Unknown',
              accusers: accuserNames,
              voteCount: accusers.length
            };
          });
          setAccusations(accusationsObj);
        }
        if (newGameState.eliminationCountdown !== undefined) {
          setEliminationCountdown(newGameState.eliminationCountdown);
        }
        if (newGameState.winner !== undefined) {
          if (newGameState.winner) {
            setGameEndData({
              winner: newGameState.winner,
              winCondition: newGameState.winCondition,
              alivePlayers: newGameState.players.filter(p => p.alive === true),
              allPlayers: newGameState.players
            });
          }
        }
        
        // Handle pause/resume state changes
        if (newGameState.gamePaused !== undefined) {
          console.log(`🔄 Host UI updating pause state: ${newGameState.gamePaused}, reason: ${newGameState.pauseReason}`);
          setGamePaused(newGameState.gamePaused);
          setPauseReason(newGameState.pauseReason || '');
          
          // Show pause/resume messages
          if (newGameState.gamePaused && newGameState.pauseReason) {
            console.log(`⏸️ Setting pause message: ${newGameState.pauseReason}`);
            setMessage({ 
              type: 'warning', 
              text: newGameState.pauseReason 
            });
          } else if (!newGameState.gamePaused && !newGameState.pauseReason) {
            console.log(`▶️ Setting resume message`);
            setMessage({ 
              type: 'success', 
              text: 'Game resumed - all players reconnected!' 
            });
            setTimeout(() => setMessage(null), 3000);
          }
        }
      };

      // Story display callback (for temporary story display without game state)
      const handleStoryDisplay = (story) => {
        console.log('📖 Host: Temporary story display callback triggered');
        setIntroStory(story);
        setIsDisplayingStory(true);
        
        // Clear story after host continues (will be handled by continue button)
      };
      
      const gameStateManager = new HostGameStateManager(hostSocket, roomId, handleStateChange, handleStoryDisplay)
      setHostGameStateManager(gameStateManager)
      console.log('HostGameStateManager initialized')
      
      // Handle player story requests during story intro phase
      hostSocket.on('player-story-request', (data) => {
        console.log('📚 Player requesting current story:', data.playerName);
        // Send current temporary story to reconnecting player
        if (introStory && isDisplayingStory) {
          console.log('📖 Sending current story to reconnecting player:', data.playerName);
          hostSocket.emit('send-story-to-player', {
            playerId: data.playerId,
            story: introStory
          });
        }
      });
      
      // Set up player action handler using the local gameStateManager variable
      hostSocket.on('player-action', (action) => {
        // Only log non-activity pings
        if (action.type !== 'PLAYER_ACTIVITY_PING') {
          console.log('Player action received by host:', action)
        }
        
        try {
          switch (action.type) {
            case 'PLAYER_JOIN':
              gameStateManager.addPlayer(action.playerId, action.playerName, action.data.profileImage, null, action.data.gender, action.data.job)
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
              
            case 'SUSPICION_VOTE':
              gameStateManager.processSuspicionVote(action.playerId, action.data.targetId)
              break
              
            case 'PLAYER_ACCUSE':
              gameStateManager.processDayVote(action.playerId, action.data.targetId)
              break
              
            case 'PLAYER_SOCKET_UPDATE':
              console.log(`🔄 Host received PLAYER_SOCKET_UPDATE: ${action.playerName} (${action.data.oldPlayerId} -> ${action.data.newPlayerId})`);
              if (gameStateManager) {
                // Update the socket ID in the host's game state
                gameStateManager.updatePlayerSocketId(action.data.oldPlayerId, action.data.newPlayerId)
              }
              break
              
            case 'PLAYER_RECONNECT':
              console.log(`🔄 Host received PLAYER_RECONNECT: ${action.playerName} (${action.data.oldPlayerId} -> ${action.data.newPlayerId})`);
              if (gameStateManager) {
                // For active game reconnections, update socket ID in all game state Maps
                if (action.data.reason === 'session_authentication') {
                  console.log(`🎮 Active game session reconnection - updating all game state mappings`);
                  // Use the more comprehensive reconnection method for active games
                  gameStateManager.updatePlayerSocketId(action.data.oldPlayerId, action.data.newPlayerId);
                  
                  // Send role assignment again to ensure player gets their role
                  const playerRole = gameStateManager.getPlayerRole(action.data.newPlayerId);
                  if (playerRole) {
                    console.log(`🎭 Re-sending role to reconnected player: ${action.playerName} -> ${playerRole.name}`);
                    hostSocket.emit('host-send-to-player', {
                      roomId: roomId,
                      playerId: action.data.newPlayerId,
                      event: SOCKET_EVENTS.ROLE_ASSIGNED,
                      data: {
                        role: playerRole,
                        playerName: action.playerName
                      }
                    });
                  }
                }
              }
              break
              
            case 'PLAYER_DISCONNECT':
              console.log(`🎯 Host received PLAYER_DISCONNECT: ${action.playerName}, reason: ${action.data.reason}`);
              console.log(`🎯 Host PLAYER_DISCONNECT details:`, {
                playerId: action.playerId,
                playerName: action.playerName,
                reason: action.data.reason
              });
              if (action.data.reason === 'lobby_disconnect') {
                // Simple lobby disconnection - remove player completely
                console.log(`📤 Removing player from lobby: ${action.playerName} (${action.playerId})`);
                gameStateManager.removePlayer(action.playerId)
              } else {
                // Game phase disconnections - continue without pausing (session-based system)
                console.log(`🔄 Game continues despite ${action.playerName} disconnect`);
              }
              break
              
            case 'PLAYER_JOIN':
              // Handle both initial joins and session authentications
              console.log(`👥 Player ${action.playerName} joined/authenticated`)
              if (action.data?.reason === 'session_authentication') {
                console.log(`🔗 Session authentication for existing player`)
                // Player already exists, just mark as connected via session
                gameStateManager.updatePlayerActivity(action.playerId)
              } else {
                console.log(`➕ New player joining lobby`)
                // This is handled by the initial PLAYER_JOIN that was already processed
                // during the original join flow, so we can ignore this duplicate
              }
              break
              
            case 'PLAYER_ACTIVITY_PING':
              // Handle activity ping - update player activity timestamp
              if (gameStateManager) {
                gameStateManager.updatePlayerActivity(action.playerId)
              }
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

    // NOTE: Removed state-related event listeners - host gets state from HostGameStateManager callback
    // This implements pure host-authoritative architecture where host is single source of truth

    // Listen for game type selected - update state and clear any error messages
    hostSocket.on(SOCKET_EVENTS.GAME_TYPE_SELECTED, (gameType) => {
      console.log('Game type selected:', gameType)
      setSelectedGameType(gameType)
      setGameState(GAME_STATES.LOBBY)
      setMessage(null) // Clear any error messages
    })

    // NOTE: Removed game-state-update listener - host should not receive state from server
    // Host is now the single source of truth and broadcasts state via HostGameStateManager

    // NOTE: Removed server pause/resume listeners - host now controls pause/resume via HostGameStateManager
    // Pure host-authoritative architecture where host manages all game state including pause/resume

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

  // REMOVED: Periodic cleanup - server now handles all lobby disconnection cleanup automatically

  // NOTE: Removed disconnection timer update effects - host gets all state from HostGameStateManager
  // Server handles connection management and host receives updates via player-action events

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
            <h3>Choose Your Evil Theme</h3>
            <p>All themes use the same mechanics but feature different storylines and role names</p>
            
            {!imagesLoaded ? (
              <div className="loading-images">
                <div className="spinner"></div>
                <p>Loading game themes...</p>
              </div>
            ) : (
              <div className="game-options">
                {getThemeList().map((theme) => (
                  <div 
                    key={theme.id}
                    className={`game-option game-option-${theme.id}`} 
                    onClick={() => handleGameTypeSelect(theme.id)}
                  >
                    <div className="theme-content">
                      <h4>{theme.name}</h4>
                      <p className="theme-description">{theme.description}</p>
                      <div className="theme-roles">
                        <span className="role-preview">
                          🗡️ {getTheme(theme.id).roles[POWERS.KILL].name} • 
                          🏥 {getTheme(theme.id).roles[POWERS.HEAL].name} • 
                          🔍 {getTheme(theme.id).roles[POWERS.INVESTIGATE].name}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
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
                    <span className="player-role" style={{ color: player.role?.color || '#666666' }}>
                      {player.role?.name || 'Unknown'}
                    </span>
                  </div>
                ))}
              </div>

              <div className="eliminated-players">
                <h4>💀 Eliminated ({gameEndData.allPlayers.filter(p => !p.alive).length})</h4>
                {gameEndData.allPlayers.filter(p => !p.alive).map(player => (
                  <div key={player.id} className="result-player eliminated">
                    <span className="player-name">{player.name}</span>
                    <span className="player-role" style={{ color: player.role?.color || '#666666' }}>
                      {player.role?.name || 'Unknown'}
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
                <span className="stat-label">{getTheme(selectedGameType).evilName} Players:</span>
                <span className="stat-value">
                  {gameEndData.allPlayers.filter(p => p.role?.alignment === 'evil').length}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Good Players:</span>
                <span className="stat-value">
                  {gameEndData.allPlayers.filter(p => p.role?.alignment === 'good').length}
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
                  
                  {/* Simplified - no complex disconnection tracking during active game */}
                  {players.some(p => !p.connected) && (
                    <div className="day-disconnections">
                      <h4>ℹ️ Some Players Offline</h4>
                      {players.filter(p => !p.connected).map(player => (
                        <div key={player.id} className="day-disconnected-player">
                          <span className="player-name">{player.name}</span>
                          <span className="disconnection-status">Offline - can reconnect via session URL</span>
                        </div>
                      ))}
                      <p className="disconnection-note">
                        Game continues - offline players can rejoin using their session URLs
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
          <p>The {getTheme(selectedGameType).settingName.toLowerCase()} sleeps while the {getTheme(selectedGameType).evilName} make their move...</p>
          
          {eliminatedPlayer || savedPlayer ? (
            <div className="night-result">
              {eliminatedPlayer && (
                <div className="elimination-notice">
                  <h3>Night Action Complete</h3>
                  <p>
                    <strong>{eliminatedPlayer.name}</strong> was eliminated by the {getTheme(selectedGameType).evilName}.
                  </p>
                </div>
              )}
              
              {savedPlayer && (
                <div className="save-notice">
                  <h3>Miraculous Survival!</h3>
                  <p>
                    Someone was attacked last night, but somehow survived! The {getTheme(selectedGameType).roles[POWERS.HEAL].name} intervened at the crucial moment.
                  </p>
                </div>
              )}
              
              {!eliminatedPlayer && !savedPlayer && (
                <div className="no-elimination-notice">
                  <h3>No One Was Killed</h3>
                  <p>The night passed peacefully - no attacks were made.</p>
                </div>
              )}
              
              <div className="next-phase-info">
                <p>The night phase is complete. Day phase coming soon...</p>
              </div>
            </div>
          ) : (
            <div className="night-progress">
              <div className="night-spinner"></div>
              <p>{getTheme(selectedGameType).evilName} selecting their target...</p>
              
              {/* Simplified - no complex pause/reconnection logic during active game */}
              {players.some(p => !p.connected) && (
                <div className="night-disconnections">
                  <h4>ℹ️ Some Players Offline</h4>
                  {players.filter(p => !p.connected).map(player => (
                    <div key={player.id} className="night-disconnected-player">
                      <span className="player-name">{player.name}</span>
                      <span className="disconnection-status">Offline - can reconnect via session URL</span>
                    </div>
                  ))}
                  <div className="disconnection-explanation">
                    <p className="disconnection-note">
                      Game continues - offline players can rejoin using their session URLs
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
                          ? 'Offline - can reconnect via session URL'
                          : player.ready 
                            ? 'Ready' 
                            : 'Reviewing role...'}
                      </span>
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

  // Show night resolved screen (waiting for host to continue)
  if (gameState === GAME_STATES.NIGHT_RESOLVED) {
    return wrapWithConnectionStatus(
      <div className="night-container">
        <div className="night-header">
          <h1>Werewolf Mafia</h1>
          <h2>Room Code: {roomId}</h2>
        </div>
        
        <div className="night-content">
          <div className="night-icon">🌙</div>
          <h2>Night Phase Complete</h2>
          
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
              <h3>Miraculous Survival!</h3>
              <p>
                Someone was attacked last night, but somehow survived! The healer intervened at the crucial moment.
              </p>
            </div>
          )}
          
          {!eliminatedPlayer && !savedPlayer && (
            <div className="no-elimination-notice">
              <h3>No One Was Killed</h3>
              <p>The night passed peacefully - no attacks were made.</p>
            </div>
          )}

          {mostSuspiciousPlayer && (
            <div className="save-notice">
              <h3>🕵️ Nighttime Whispers</h3>
              <p>
                <strong>{mostSuspiciousPlayer.name}</strong> is currently drawing the most suspicion among the citizens...
              </p>
            </div>
          )}
          
          <div className="host-continue-section">
            <p className="continue-instruction">
              ✋ <strong>Host:</strong> Click Continue when everyone has seen the results and you're ready to start the day phase.
            </p>
            <button 
              className="continue-button"
              onClick={() => hostGameStateManager.continueToNextPhase()}
            >
              Continue to Day Phase ☀️
            </button>
          </div>
          {renderPauseOverlay()}
        </div>
      </div>
    )
  }

  // Show day resolved screen (waiting for host to continue)
  if (gameState === GAME_STATES.DAY_RESOLVED) {
    return wrapWithConnectionStatus(
      <div className="day-container">
        <div className="day-header">
          <h1>Werewolf Mafia</h1>
          <h2>Room Code: {roomId}</h2>
        </div>
        
        <div className="day-content">
          <div className="day-icon">☀️</div>
          <h2>Day Phase Complete</h2>
          
          {dayEliminatedPlayer && (
            <div className="elimination-notice">
              <h3>Player Eliminated</h3>
              <p>
                <strong>{dayEliminatedPlayer.name}</strong> was eliminated by majority vote.
              </p>
              <p className="mystery-text">Their role remains a mystery...</p>
            </div>
          )}
          
          <div className="host-continue-section">
            <p className="continue-instruction">
              ✋ <strong>Host:</strong> Click Continue when everyone has processed the elimination and you're ready to start the night phase.
            </p>
            <button 
              className="continue-button"
              onClick={() => hostGameStateManager.continueToNextPhase()}
            >
              Continue to Night Phase 🌙
            </button>
          </div>
          {renderPauseOverlay()}
        </div>
      </div>
    )
  }

  // Show story intro screen
  if (gameState === GAME_STATES.STORY_INTRO) {
    
    return wrapWithConnectionStatus(
      <div className="story-intro-container">
        <div className="story-intro-header">
          <h1>{getTheme(selectedGameType).name === 'Werewolf' ? '🐺' : getTheme(selectedGameType).name === 'Mafia' ? '🕴️' : getTheme(selectedGameType).name === 'Vampire' ? '🧛' : '🔫'} {getTheme(selectedGameType).name}</h1>
          <h2>Room Code: {roomId}</h2>
        </div>
        
        <div className="story-intro-content">
          <div className="story-intro-icon">📖</div>
          <h2>The Story Begins...</h2>
          
          {introStory ? (
            <div className="story-text">
              <p>{introStory}</p>
            </div>
          ) : (
            <div className="story-loading">
              <div className="story-spinner"></div>
              <p>Crafting your tale...</p>
            </div>
          )}
          
          {introStory && (
            <div className="host-continue-section">
              <p className="continue-instruction">
                ✋ <strong>Host:</strong> Click Continue when everyone has read the story and you're ready to start the night phase.
              </p>
              <button 
                className="continue-button"
                onClick={() => {
                  // Clear temporary story display
                  setIntroStory(null);
                  setIsDisplayingStory(false);
                  // Continue to next phase
                  hostGameStateManager.continueToNextPhase();
                }}
              >
                Continue to Night Phase 🌙
              </button>
            </div>
          )}
          
          {/* Show connected players */}
          <div className="players-ready">
            <h3>All Players Ready ({players.length})</h3>
            <div className="players-grid">
              {players.map(player => (
                <div key={player.id} className={`player-ready-item ${!player.connected ? 'disconnected' : ''}`}>
                  <div className="player-avatar">
                    <img 
                      src={getProfileImageUrl(selectedGameType, player.profileImage, supportsWebP)} 
                      alt={player.name}
                      className="player-profile-image"
                    />
                  </div>
                  <span className="player-name">{player.name}</span>
                  {!player.connected && <span className="disconnection-status">📵</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
        {renderPauseOverlay()}
      </div>
    )
  }

  // Default lobby view
  return wrapWithConnectionStatus(
    <div className="lobby-container">
      <div className="lobby-header">
        <h1>{getTheme(selectedGameType).name === 'Werewolf' ? '🐺' : getTheme(selectedGameType).name === 'Mafia' ? '🕴️' : getTheme(selectedGameType).name === 'Vampire' ? '🧛' : '🔫'} {getTheme(selectedGameType).name}</h1>
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
                  </div>
                  <span className="player-status connected">🟢</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="game-controls">
          {/* Simple game start button */}
          {players.length >= GAME_CONFIG.MIN_PLAYERS ? (
            <button 
              className="start-game-btn enabled"
              onClick={handleStartGame}
            >
              ✅ Start Game ({players.length} Players)
            </button>
          ) : (
            <button className="start-game-btn disabled" disabled>
              Need {GAME_CONFIG.MIN_PLAYERS - players.length} more players
            </button>
          )}
          
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
