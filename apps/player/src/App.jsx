import { Routes, Route } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import { SOCKET_EVENTS, validatePlayerName, GAME_STATES, GAME_TYPES, PROFILE_IMAGES, getProfileImageUrl, ROLE_SETS, checkWebPSupport, ConnectionStatus, POWERS } from '@werewolf-mafia/shared'
import SessionConnectionManager from './utils/ConnectionManager'
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
  const [savedPlayer, setSavedPlayer] = useState(null)
  const [dayEliminatedPlayer, setDayEliminatedPlayer] = useState(null)
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
  const [suspicionTargets, setSuspicionTargets] = useState([]) // Available targets for suspicion voting
  const [selectedSuspicion, setSelectedSuspicion] = useState(null) // Citizen's selected suspicion target
  const [hasSuspicionVoted, setHasSuspicionVoted] = useState(false) // Whether citizen has voted
  const [mostSuspiciousPlayer, setMostSuspiciousPlayer] = useState(null) // Most suspicious player result
  const [nightActionsComplete, setNightActionsComplete] = useState(false) // Whether all night actions are complete
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
  const [connectionState, setConnectionState] = useState(ConnectionStatus.CONNECTED)

  // New state for game pause/resume
  const [gamePaused, setGamePaused] = useState(false);
  const [pauseReason, setPauseReason] = useState('');

  // New state for reconnection attempts
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [sessionUrl, setSessionUrl] = useState(null); // Store session URL for bookmarking

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

    // Create connection manager (NEW SESSION-BASED)
    const manager = new SessionConnectionManager(
      newSocket,
      null, // No session token for initial join
      (newState) => {
        setConnectionState(newState)
        if (newState === 'DISCONNECTED') {
          setError('Connection lost. Click to refresh the page.')
        } else if (newState === 'RECONNECTING') {
          setError('Reconnecting...')
        }
      },
      (gameState) => {
        // Handle game state updates
        console.log('Game state update received:', gameState)
        // Process game state update here
      }
    )
    
    setSocket(newSocket)
    setConnectionManager(manager)

    // Get room info when component loads
    if (roomId) {
              newSocket.on('connect', () => {
          console.log('Socket connected, requesting room info')
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
    const sessionToken = urlParams.get('sessionToken')
    const isAuthenticated = urlParams.get('authenticated') === 'true'

    if (shouldAutoJoin && autoJoinPlayerName && roomId) {
      console.log(`Auto-join detected: ${autoJoinPlayerName} -> ${roomId}`)
      setPlayerName(autoJoinPlayerName)
    }

    // Handle authenticated session - set up session connection manager
    if (sessionToken && isAuthenticated) {
      console.log('🔗 Session authenticated, setting up session-based connection')
      // Update connection manager to use real session token
      if (manager) {
        manager.updateSessionToken(sessionToken)
      }
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
      console.log('📋 Room info received:', {
        gameType: data.gameType,
        availableImages: data.availableImages?.length || 0,
        defaultImage: data.defaultImage
      })
      
      setGameType(data.gameType)
      setAvailableImages(data.availableImages)
      setCurrentProfileImage(data.defaultImage)
      
      // Clear any loading errors now that we have the data
      if (error && error.includes('Loading character images')) {
        setError(null)
      }
      
      console.log('✅ Profile selection ready with', data.availableImages?.length || 0, 'images')
      
      // If this was an auto-join, automatically join now
      const urlParams = new URLSearchParams(window.location.search)
      const autoJoinPlayerName = urlParams.get('playerName')
      const shouldAutoJoin = urlParams.get('autoJoin') === 'true'
      
      if (shouldAutoJoin && autoJoinPlayerName && !isJoining) {
        console.log('🚀 Auto-joining with', autoJoinPlayerName)
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
      
      if (!data.playerId || !data.playerName) {
        console.error('ERROR: Missing required data in PLAYER_JOINED event!', data)
        return
      }
      
      // Check if this is a reconnection attempt
      if (data.reconnectToken && data.isReconnection && !isReconnecting) {
        console.log('🔄 RECONNECTION DETECTED - using reconnect token')
        console.log('📤 Sending PLAYER_RECONNECT with token:', data.reconnectToken.substring(0, 16) + '...')
        
        setIsReconnecting(true)
        setPlayerId(data.playerId)
        setPlayerName(data.playerName)
        setIsJoining(false)
        
        // Clear the join form state since we're reconnecting
        setError(null)
        
        // Immediately send reconnect with the token
        newSocket.emit(SOCKET_EVENTS.PLAYER_RECONNECT, {
          reconnectToken: data.reconnectToken,
          roomId: roomId
        })
        
        // Set waiting state for reconnection process
        setIsWaiting(true)
        setMessage({ type: 'info', text: 'Reconnecting to game...' })
        console.log('🔄 Reconnection process initiated')
        return
      }
      
      // Normal player join
      setPlayerId(data.playerId)
      setPlayerName(data.playerName)
      setIsJoining(false)
      setMessage(null)

      // Store session URL if provided and redirect to it immediately
      if (data.sessionUrl) {
        console.log('📱 Session URL received, redirecting immediately to:', data.sessionUrl)
        setSessionUrl(data.sessionUrl)
        
        // Update connection manager with session token
        if (connectionManager && data.sessionToken) {
          connectionManager.updateSessionToken(data.sessionToken)
        }
        
        // Immediate redirect for seamless experience
        console.log('🔗 Redirecting to session URL:', data.sessionUrl)
        window.location.href = data.sessionUrl
      } else {
        // Only set waiting state if no session URL (fallback)
        setIsWaiting(true)
      }
      
      console.log('=== PLAYER_JOINED PROCESSING COMPLETE ===')
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



    // Handle reconnection success
    newSocket.on(SOCKET_EVENTS.PLAYER_RECONNECTED, (data) => {
      console.log('🎉 RECONNECTION SUCCESSFUL:', data);
      setConnectionState(ConnectionStatus.CONNECTED);
      setReconnectAttempts(0);
      setIsReconnecting(false);
      setIsWaiting(true); // Stay in waiting state to receive game state
      setError(null);
      setMessage({ type: 'success', text: 'Successfully reconnected to game!' });
      setTimeout(() => setMessage(null), 3000);
      
      // Update player state from reconnection
      if (data.playerId && data.playerName) {
        setPlayerId(data.playerId)
        setPlayerName(data.playerName)
        console.log('✅ Updated player state from reconnection:', data.playerId)
      }
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
        setConnectionState(ConnectionStatus.RECONNECTING);
        setError('Connection lost during game. Please wait for reconnection.');
        
        // Attempt to reconnect after a short delay
        setTimeout(() => {
          setReconnectAttempts(prev => prev + 1);
        }, 1000);
      }
    });



    // Handle errors
    newSocket.on('error', (data) => {
      console.log('❌ Error received from server:', data);
      
      // Provide specific error messages for different scenarios
      if (data.gameInProgress) {
        setError('Game is already in progress. Only existing players can reconnect.');
      } else if (data.playerAlreadyConnected) {
        setError('That player is already connected. Please choose a different name or wait for them to disconnect.');
      } else {
        setError(data.message);
      }
      
      if (isJoining) {
        setIsJoining(false);
      }
      if (isReconnecting) {
        setIsReconnecting(false);
        setIsWaiting(false);
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
      console.log('🎮 GAME STATE UPDATE:', masterState.gameState);
      console.log('📊 PLAYER STATUS - Current Player:', playerId, playerName);
      
      // Show all players and their alive/dead status
      if (masterState.players) {
        console.log('📊 ALL PLAYERS STATUS:');
        masterState.players.forEach(p => {
          const status = p.alive ? '✅ ALIVE' : '💀 DEAD';
          const isCurrent = p.id === playerId || p.name === playerName;
          console.log(`  ${isCurrent ? '👤 YOU' : '   '} ${p.name} (${p.id}): ${status}`);
        });
      }
      
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
        console.log('🚨 PLAYER NOT FOUND in game state!');
        console.log('🚨 Expected: playerId =', playerId, ', playerName =', playerName);
        // Still update basic state even if we can't find current player
        setGameState(masterState.gameState);
        setGamePaused(masterState.gamePaused);
        setPauseReason(masterState.pauseReason);
        return;
      }
      
      console.log('👤 CURRENT PLAYER STATUS:', {
        name: currentPlayer.name,
        alive: currentPlayer.alive ? '✅ ALIVE' : '💀 DEAD',
        role: currentPlayer.role?.name || 'Unknown'
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
            
            // Clear previous night results when new night phase starts
            setSelectedInvestigation(null);
            setHasInvestigated(false);
            setInvestigationResult(null);
            setSelectedHeal(null);
            setHasHealed(false);
            setSelectedTarget(null);
            setHasVoted(false);
            setSelectedSuspicion(null);
            setHasSuspicionVoted(false);
            
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
              } else if (currentPlayer.role.power === POWERS.HEAL) {
                console.log('Heal role detected, available targets:', masterState.availableTargets.doctor);
                console.log('Heal targets type:', typeof masterState.availableTargets.doctor);
                console.log('Heal targets length:', masterState.availableTargets.doctor?.length);
                console.log('Heal targets content:', JSON.stringify(masterState.availableTargets.doctor, null, 2));
                const doctorTargets = masterState.availableTargets.doctor || [];
                setHealTargets(doctorTargets);
                console.log('setHealTargets called with:', doctorTargets.length, 'targets');
              } else if (currentPlayer.role.power === POWERS.INVESTIGATE) {
                console.log('Investigation role detected, available targets:', masterState.availableTargets.seer);
                console.log('Investigation targets type:', typeof masterState.availableTargets.seer);
                console.log('Investigation targets length:', masterState.availableTargets.seer?.length);
                console.log('Investigation targets content:', JSON.stringify(masterState.availableTargets.seer, null, 2));
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
            
            // Update suspicion vote state from master state (for citizen roles)
            if (currentPlayer.role && currentPlayer.role.power === POWERS.CITIZEN) {
              const suspicionTargets = masterState.players.filter(p => 
                p.alive && p.id !== playerId
              ).map(p => ({ id: p.id, name: p.name }));
              setSuspicionTargets(suspicionTargets);
              
              const suspicionVotesArray = masterState.suspicionVotes || [];
              const playerSuspicion = suspicionVotesArray.find(([voterId]) => voterId === playerId);
              setSelectedSuspicion(playerSuspicion ? playerSuspicion[1] : null);
              setHasSuspicionVoted(!!playerSuspicion);
            }
            
            // Update night actions completion status and results
            setNightActionsComplete(masterState.nightActionsComplete || false);
            if (masterState.nightActionsComplete) {
              setEliminatedPlayer(masterState.eliminatedPlayer);
              setSavedPlayer(masterState.savedPlayer);
              setMostSuspiciousPlayer(masterState.mostSuspiciousPlayer);
            }
          }
          break;
          
                  case GAME_STATES.DAY_PHASE:
          if (currentPlayer) {
            console.log('📅 DAY PHASE - Player alive status:', currentPlayer.alive ? '✅ ALIVE' : '💀 DEAD');
            
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
              console.log('💀 Setting elimination info for dead player:', currentPlayer.name);
            } else {
              console.log('✅ Player is alive, clearing elimination info');
              setEliminationInfo(null);
            }
            
            // Convert accusations array back to object for UI (same as host)
            if (masterState.accusations) {
              const accusationsObj = {}
              masterState.accusations.forEach(([accusedId, accusers]) => {
                const accusedPlayer = masterState.players?.find(p => p.id === accusedId)
                // Convert accuser IDs to names
                const accuserNames = accusers.map(accuserId => {
                  const accuserPlayer = masterState.players?.find(p => p.id === accuserId)
                  return accuserPlayer?.name || 'Unknown'
                })
                accusationsObj[accusedId] = {
                  name: accusedPlayer?.name || 'Unknown',
                  accusers: accuserNames,
                  voteCount: accusers.length
                }
              })
              setAccusations(accusationsObj)
            } else {
              setAccusations({})
            }
            
            setEliminationCountdown(masterState.eliminationCountdown);
            
            // Set day phase targets from master state
            if (masterState.dayPhaseTargets) {
              console.log('📊 Day phase targets from master state:', masterState.dayPhaseTargets.length);
              setDayPhaseTargets(masterState.dayPhaseTargets);
            } else {
              // Fallback: filter alive players from master state
              const alivePlayers = masterState.players.filter(p => p.alive);
              console.log('📊 Day phase targets fallback - alive players:', alivePlayers.length);
              setDayPhaseTargets(alivePlayers);
            }
          }
          break;
          
        case GAME_STATES.NIGHT_RESOLVED:
          if (currentPlayer) {
            console.log('🌙 NIGHT RESOLVED - Setting player role and elimination status');
            setPlayerRole(currentPlayer.role);
            setIsEliminated(!currentPlayer.alive);
            setEliminatedPlayer(masterState.eliminatedPlayer);
            setSavedPlayer(masterState.savedPlayer);
            setMostSuspiciousPlayer(masterState.mostSuspiciousPlayer);
            
            // Set eliminationInfo for dead players
            if (!currentPlayer.alive) {
              setEliminationInfo({
                id: currentPlayer.id,
                name: currentPlayer.name,
                role: currentPlayer.role
              });
            }
          }
          break;
          
        case GAME_STATES.DAY_RESOLVED:
          if (currentPlayer) {
            console.log('☀️ DAY RESOLVED - Setting player role and elimination status');
            setPlayerRole(currentPlayer.role);
            setIsEliminated(!currentPlayer.alive);
            setDayEliminatedPlayer(masterState.dayEliminatedPlayer);
            
            // Set eliminationInfo for dead players
            if (!currentPlayer.alive) {
              setEliminationInfo({
                id: currentPlayer.id,
                name: currentPlayer.name,
                role: currentPlayer.role
              });
            }
          }
          break;
          
        case GAME_STATES.ENDED:
          // Create gameEndData from masterState (similar to how host does it)
          if (masterState.winner) {
            setGameEndData({
              winner: masterState.winner,
              winCondition: masterState.winCondition,
              alivePlayers: masterState.players?.filter(p => p.alive) || [],
              allPlayers: masterState.players || []
            });
          }
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

    // Check if we have available images loaded
    if (!availableImages || availableImages.length === 0) {
      setError('Loading character images... Please wait a moment and try again.')
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
    console.log('availableImages:', availableImages?.length || 0, 'images')
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

  const handleSuspicionVote = (targetId) => {
    if (socket && !isEliminated && !hasSuspicionVoted) { // Prevent dead players from voting and multiple votes
      socket.emit(SOCKET_EVENTS.SUSPICION_VOTE, { targetId })
      console.log('Cast suspicion vote for:', targetId)
      setSelectedSuspicion(targetId)
      setHasSuspicionVoted(true)
      setMessage(null) // Clear any old messages
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
                      <span className="accusation-text">
                        {accusationData.accusers.join(', ')} accuses {accusationData.name} - {accusationData.voteCount} Votes
                      </span>
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



  // Show night resolved screen (waiting for host to continue)
  if (gameState === GAME_STATES.NIGHT_RESOLVED && playerRole) {
    return wrapWithPauseOverlay(
      <div className="night-container">
        <div className="night-resolved-container">
          <div className="night-resolved-content">
            <div className="night-header">
              <div className="night-icon">🌙</div>
              <h1>Night Phase Complete</h1>
              <p className="role-reminder">You are: <strong style={{ color: playerRole.color }}>{playerRole.name}</strong></p>
            </div>

            <div className="resolution-section">
              {eliminatedPlayer && (
                <div className="elimination-result">
                  <h3>Night Action Complete</h3>
                  <p><strong>{eliminatedPlayer.name}</strong> was eliminated during the night.</p>
                </div>
              )}
              
              {savedPlayer && (
                <div className="save-result">
                  <h3>Miraculous Survival!</h3>
                  <p>Someone was attacked last night, but somehow survived!</p>
                </div>
              )}
              
              {!eliminatedPlayer && !savedPlayer && (
                <div className="no-elimination-result">
                  <h3>No One Was Killed</h3>
                  <p>The night passed peacefully...</p>
                </div>
              )}

              {mostSuspiciousPlayer && (
                <div className="save-result">
                  <h3>🕵️ Nighttime Whispers</h3>
                  <p><strong>{mostSuspiciousPlayer.name}</strong> is currently drawing the most suspicion...</p>
                </div>
              )}

              <div className="waiting-for-host">
                <div className="waiting-icon">⏳</div>
                <h3>Waiting for Host</h3>
                <p>The host will continue to the day phase when everyone is ready.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Show day resolved screen (waiting for host to continue)
  if (gameState === GAME_STATES.DAY_RESOLVED && playerRole) {
    return wrapWithPauseOverlay(
      <div className="day-container">
        <div className="day-resolved-container">
          <div className="day-resolved-content">
            <div className="day-header">
              <div className="day-icon">☀️</div>
              <h1>Day Phase Complete</h1>
              <p className="role-reminder">You are: <strong style={{ color: playerRole.color }}>{playerRole.name}</strong></p>
            </div>

            <div className="resolution-section">
              {dayEliminatedPlayer && (
                <div className="elimination-result">
                  <h3>Player Eliminated</h3>
                  <p><strong>{dayEliminatedPlayer.name}</strong> was eliminated by majority vote.</p>
                  <p className="mystery-text">Their role remains a mystery...</p>
                </div>
              )}

              <div className="waiting-for-host">
                <div className="waiting-icon">⏳</div>
                <h3>Waiting for Host</h3>
                <p>The host will continue to the night phase when everyone is ready.</p>
              </div>
            </div>
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
                    {nightActionsComplete ? (
                      <div className="night-complete-status">
                        <p>✅ All night actions complete! Results:</p>
                        {eliminatedPlayer && <p>💀 <strong>{eliminatedPlayer.name}</strong> was eliminated</p>}
                        {savedPlayer && <p>🛡️ Someone was saved from elimination!</p>}
                        {!eliminatedPlayer && !savedPlayer && <p>🌙 No one was eliminated</p>}
                        {mostSuspiciousPlayer && <p>🕵️ <strong>{mostSuspiciousPlayer.name}</strong> draws suspicion</p>}
                        <p><small>Waiting for day phase to begin...</small></p>
                      </div>
                    ) : (
                      <>
                        <p>Protection cast! Waiting for other night actions...</p>
                        <div className="heal-info">
                          <small>Your choice is final and cannot be changed</small>
                        </div>
                      </>
                    )}
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
                    {investigateTargets.filter(target => target.id !== playerId).map((target) => (
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
                        <p className="result-text">
                          <strong>{investigationResult.targetName}</strong> is aligned with{' '}
                          <span className={`alignment-${investigationResult.alignment}`}>
                            {investigationResult.alignment === 'good' ? 'Good Forces 😇' : 'Evil Forces 😈'}
                          </span>
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="investigate-confirmation">
                    {nightActionsComplete ? (
                      <div className="night-complete-status">
                        <p>✅ All night actions complete! Results:</p>
                        {eliminatedPlayer && <p>💀 <strong>{eliminatedPlayer.name}</strong> was eliminated</p>}
                        {savedPlayer && <p>🛡️ Someone was saved from elimination!</p>}
                        {!eliminatedPlayer && !savedPlayer && <p>🌙 No one was eliminated</p>}
                        {mostSuspiciousPlayer && <p>🕵️ <strong>{mostSuspiciousPlayer.name}</strong> draws suspicion</p>}
                        <p><small>Waiting for day phase to begin...</small></p>
                      </div>
                    ) : (
                      <>
                        <p>Waiting for other night actions to complete...</p>
                        <div className="investigate-info">
                          <small>Your investigation is complete and private to you</small>
                        </div>
                      </>
                    )}
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

            {/* Show the new power-based description prominently */}
            {playerRole.powerDescription && (
              <div className="role-power">
                <h3>Your Power</h3>
                <p className="power-description">
                  <strong>{playerRole.powerDescription}</strong>
                </p>
              </div>
            )}

            <div className="role-description">
              <h3>Background</h3>
              <p>{playerRole.description}</p>
            </div>

            <div className="role-ability">
              <h3>How to Use Your Power</h3>
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
                  setIsReconnecting(false)
                  setIsJoining(false)
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

              {/* Session URL for bookmarking */}
              {sessionUrl && (
                <div className="session-info">
                  <h3>📱 Bookmark This Link</h3>
                  <p>Save this link to easily rejoin if you get disconnected:</p>
                  <div className="session-url-container">
                    <input 
                      type="text" 
                      value={sessionUrl} 
                      readOnly 
                      className="session-url-input"
                      onClick={(e) => e.target.select()}
                    />
                    <button 
                      className="copy-url-btn"
                      onClick={() => {
                        navigator.clipboard.writeText(sessionUrl).then(() => {
                          setMessage({ type: 'success', text: 'Link copied! 📋' })
                          setTimeout(() => setMessage(null), 2000)
                        }).catch(() => {
                          // Fallback for older browsers
                          const input = document.querySelector('.session-url-input')
                          input.select()
                          try {
                            document.execCommand('copy')
                            setMessage({ type: 'success', text: 'Link copied! 📋' })
                            setTimeout(() => setMessage(null), 2000)
                          } catch (err) {
                            setMessage({ type: 'error', text: 'Please copy the link manually' })
                            setTimeout(() => setMessage(null), 3000)
                          }
                        })
                      }}
                    >
                      📋 Copy
                    </button>
                  </div>
                  <p className="session-help">
                    💡 This link will work even if you close your browser or switch devices
                  </p>
                </div>
              )}
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
      {connectionState !== ConnectionStatus.CONNECTED && (
        <div className={`connection-status ${connectionState.toLowerCase()}`}>
          {connectionState === ConnectionStatus.RECONNECTING && '🔄 Reconnecting...'}
          {connectionState === ConnectionStatus.DISCONNECTED && '🔴 Connection Lost'}
        </div>
      )}
      
      {/* Message Display */}
      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}
      
      {/* Only show join form if connected */}
              {connectionState === ConnectionStatus.CONNECTED && (
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

              {/* Character Selection */}
              <div className="form-group character-selection">
                <label>Choose Your Character</label>
                
                {gameType && availableImages.length > 0 ? (
                  <>
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
                  </>
                ) : (
                  <div className="profile-loading">
                    <div className="spinner"></div>
                    <p>Loading character images...</p>
                    <p style={{ fontSize: '14px', color: '#666', marginTop: '10px' }}>
                      Game Type: {gameType || 'Loading...'}<br />
                      Available Images: {availableImages?.length || 0}
                    </p>
                  </div>
                )}
              </div>
              
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

// Session-based authentication and game component
function SessionPlayer() {
  const { roomId, sessionToken } = useParams()
  const navigate = useNavigate()
  
  // Authentication states
  const [status, setStatus] = useState('authenticating')
  const [authMessage, setAuthMessage] = useState('Authenticating session...')
  
  // Game states (same as JoinRoom)
  const [socket, setSocket] = useState(null)
  const [playerId, setPlayerId] = useState(null)
  const [playerName, setPlayerName] = useState('')
  const [gameState, setGameState] = useState(GAME_STATES.LOBBY)
  const [playerRole, setPlayerRole] = useState(null)
  const [isReady, setIsReady] = useState(false)
  const [gameType, setGameType] = useState(null)
  const [message, setMessage] = useState(null)
  const [connectionManager, setConnectionManager] = useState(null)
  const [connectionState, setConnectionState] = useState(ConnectionStatus.CONNECTED)
  
  // Add other game state variables as needed...
  const [voteTargets, setVoteTargets] = useState([])
  const [selectedTarget, setSelectedTarget] = useState(null)
  const [hasVoted, setHasVoted] = useState(false)
  const [eliminatedPlayer, setEliminatedPlayer] = useState(null)
  const [savedPlayer, setSavedPlayer] = useState(null)
  const [dayEliminatedPlayer, setDayEliminatedPlayer] = useState(null)
  const [isEliminated, setIsEliminated] = useState(false)
  const [gameEndData, setGameEndData] = useState(null)
  const [gamePaused, setGamePaused] = useState(false)
  const [pauseReason, setPauseReason] = useState('')
  
  // Night phase state variables (missing from original SessionPlayer)
  const [mafiaVotes, setMafiaVotes] = useState({}) // { playerId: { name, target, targetName } }
  const [consensusTimer, setConsensusTimer] = useState(null) // { targetId, targetName, timeLeft }
  const [mafiaVotesLocked, setMafiaVotesLocked] = useState(false) // Whether Mafia votes are locked
  const [healTargets, setHealTargets] = useState([]) // Available targets for Doctor to heal
  const [selectedHeal, setSelectedHeal] = useState(null) // Doctor's selected heal target
  const [investigationResult, setInvestigationResult] = useState(null) // Seer's investigation result
  const [investigateTargets, setInvestigateTargets] = useState([]) // Available targets for Seer to investigate
  const [selectedInvestigation, setSelectedInvestigation] = useState(null) // Seer's selected target

  // Day phase state variables (missing from original SessionPlayer)
  const [dayPhaseTargets, setDayPhaseTargets] = useState([]) // Available targets for day phase voting
  const [accusations, setAccusations] = useState({}) // Current accusations/votes { playerId: { name, accusers, voteCount } }
  const [accusationTarget, setAccusationTarget] = useState(null) // Player's current accusation target
  const [eliminationCountdown, setEliminationCountdown] = useState(null) // Elimination countdown timer
  const [suspicionTargets, setSuspicionTargets] = useState([]) // Available targets for suspicion voting
  const [selectedSuspicion, setSelectedSuspicion] = useState(null) // Citizen's selected suspicion target
  const [hasSuspicionVoted, setHasSuspicionVoted] = useState(false) // Whether citizen has voted
  const [mostSuspiciousPlayer, setMostSuspiciousPlayer] = useState(null) // Most suspicious player result
  const [nightActionsComplete, setNightActionsComplete] = useState(false) // Whether all night actions are complete

  useEffect(() => {
    // Validate session token from URL
    if (!sessionToken || sessionToken.length < 8) {
      console.log('❌ Invalid session token in URL:', sessionToken);
      setStatus('invalid');
      setAuthMessage('Invalid session link');
      setTimeout(() => navigate(`/join/${roomId}`), 2000);
      return;
    }

    const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3002'
    
    console.log('🔌 Creating socket connection for session authentication');
    console.log('🔑 Session token:', sessionToken.substring(0, 8) + '...');
    
    // Connect to server and authenticate session
    const newSocket = io(SERVER_URL, {
      reconnection: false, // Let SessionConnectionManager handle reconnection
      timeout: 10000
    })

    // Create connection manager with the actual session token from URL
    const manager = new SessionConnectionManager(
      newSocket,
      sessionToken, // Use real session token from URL
      (newState) => {
        setConnectionState(newState)
        if (newState === 'DISCONNECTED') {
          setMessage({ type: 'error', text: 'Connection lost. Click to refresh the page.' })
        } else if (newState === 'RECONNECTING') {
          setMessage({ type: 'warning', text: 'Reconnecting...' })
        }
      },
      (gameStateUpdate) => {
        console.log('🎮 Game state update via ConnectionManager:', gameStateUpdate?.gameState)
        // Handle game state updates if needed
      }
    )
    
    setSocket(newSocket)
    setConnectionManager(manager)

    // Session authentication response handler
    newSocket.on(SOCKET_EVENTS.CONNECTION_STATUS_UPDATE, (data) => {
      console.log('📋 Session authentication result:', data)
      
      if (data.status === 'authenticated') {
        console.log('✅ Session authenticated successfully')
        setStatus('authenticated')
        setAuthMessage('Session authenticated! Loading game...')
        
        // Store playerId immediately for race condition fix
        currentPlayerId = data.playerId
        setPlayerId(data.playerId)
        setPlayerName(data.playerName)
        
        // Set initial game state from authentication
        if (data.gameState) {
          console.log('📊 Initial game state from session:', data.gameState)
          setGameState(data.gameState)
          
          if (data.currentRole) {
            console.log('🎭 Player role from session:', data.currentRole.name)
            setPlayerRole(data.currentRole)
          }
          
          if (data.isAlive === false) {
            console.log('💀 Player is eliminated')
            setIsEliminated(true)
          }
        }
        
        // Request room info for game type
        newSocket.emit(SOCKET_EVENTS.GET_ROOM_INFO, { roomId })
        
        // Move to ready state after brief delay
        setTimeout(() => {
          console.log('🎯 Setting status to ready for game interface')
          setStatus('ready')
          
          // Send activity ping to maintain connection
          if (data.gameState !== GAME_STATES.LOBBY) {
            console.log('📡 Sending ready signal to host for game updates')
            newSocket.emit('player-activity-ping')
          }
        }, 1000)
        
      } else if (data.status === 'invalid_session') {
        console.log('❌ Session invalid:', data.message)
        setStatus('invalid')
        setAuthMessage(data.message || 'Session expired or invalid')
        
        setTimeout(() => {
          navigate(`/join/${roomId}`)
        }, 3000)
      }
    })

    // Add all the same game event listeners as JoinRoom
    newSocket.on(SOCKET_EVENTS.ROOM_INFO, (data) => {
      console.log('📋 Room info received for session player:', data.gameType)
      setGameType(data.gameType)
    })

    newSocket.on(SOCKET_EVENTS.ROLE_ASSIGNED, (data) => {
      console.log('🎭 Role assigned to session player:', data.role.name)
      setPlayerRole(data.role)
      setGameState(GAME_STATES.ROLE_ASSIGNMENT)
      setIsReady(false) // Reset ready state for new role assignment
      setMessage(null)
    })

    // Store playerId reference for immediate use (fixes race condition)
    let currentPlayerId = null
    
    // Listen for game state updates (same as regular players)
    newSocket.on(SOCKET_EVENTS.GAME_STATE_UPDATE, (masterState) => {
      console.log('🎮 Master game state update in SessionPlayer:', masterState?.gameState)
      
      // Use the stored playerId or current state playerId
      const playerIdToUse = currentPlayerId || playerId
      
      // Only process if we have a valid playerId and masterState
      if (masterState && playerIdToUse) {
        const currentPlayer = masterState.players?.find(p => p.id === playerIdToUse)
        
        if (currentPlayer) {
          console.log('👤 Session player state in master update:', {
            name: currentPlayer.name,
            alive: currentPlayer.alive,
            role: currentPlayer.role?.name,
            gameState: masterState.gameState
          })
          
          // Update game state FIRST (this is the critical fix)
          console.log('🔄 Updating SessionPlayer game state:', masterState.gameState)
          setGameState(masterState.gameState)
          setGameType(masterState.gameType)
          
          // Update player-specific state
          if (currentPlayer.role) {
            setPlayerRole(currentPlayer.role)
          }
          
          setIsEliminated(!currentPlayer.alive)
          
          // Handle phase-specific state
          if (masterState.gameState === GAME_STATES.ROLE_ASSIGNMENT) {
            setIsReady(currentPlayer.isReady || false)
          }
          
          // Handle night phase state updates
          if (masterState.gameState === GAME_STATES.NIGHT_PHASE) {
            // Clear previous night results when new night phase starts
            setSelectedInvestigation(null);
            setInvestigationResult(null);
            setSelectedHeal(null);
            setSelectedTarget(null);
            setSelectedSuspicion(null);
            setHasSuspicionVoted(false);
            
            // Extract role-specific targets and actions from master state
            if (currentPlayer.role) {
              if (currentPlayer.role.alignment === 'evil') {
                // For Werewolf/Mafia - get available targets and voting state
                const aliveNonMafia = masterState.players.filter(p => 
                  p.alive && p.role?.alignment !== 'evil'
                ).map(p => ({ id: p.id, name: p.name }))
                setVoteTargets(aliveNonMafia)
                
                // Update mafia vote state from master state
                if (masterState.mafiaVotes) {
                  const voteMap = {}
                  masterState.mafiaVotes.forEach(([voterId, targetId]) => {
                    const voter = masterState.players.find(p => p.id === voterId)
                    const target = masterState.players.find(p => p.id === targetId)
                    if (voter && target) {
                      voteMap[voterId] = {
                        name: voter.name,
                        target: targetId,
                        targetName: target.name
                      }
                    }
                  })
                  setMafiaVotes(voteMap)
                  
                  // Update player's own vote
                  const playerVote = masterState.mafiaVotes.find(([voterId]) => voterId === playerIdToUse)
                  setSelectedTarget(playerVote ? playerVote[1] : null)
                }
                
                setMafiaVotesLocked(masterState.mafiaVotesLocked || false)
                setConsensusTimer(masterState.consensusTimer)
              }
              
              else if (currentPlayer.role.power === POWERS.HEAL) {
                // For heal power roles (Doctor/Healer/Priest/Medic) - get all alive players as potential targets
                const aliveTargets = masterState.players.filter(p => 
                  p.alive
                ).map(p => ({ id: p.id, name: p.name }))
                setHealTargets(aliveTargets)
                
                // Update player's heal selection from master state
                if (masterState.healActions) {
                  const playerHeal = masterState.healActions.find(([healerId]) => healerId === playerIdToUse)
                  setSelectedHeal(playerHeal ? playerHeal[1] : null)
                }
              }
              
              else if (currentPlayer.role.power === POWERS.INVESTIGATE) {
                // For investigation power roles (Seer/Detective/Oracle/Agent) - get alive players except self
                const investigateTargets = masterState.players.filter(p => 
                  p.alive && p.id !== playerIdToUse
                ).map(p => ({ id: p.id, name: p.name }))
                setInvestigateTargets(investigateTargets)
                
                // Update player's investigation selection from master state
                if (masterState.investigationActions) {
                  const playerInvestigation = masterState.investigationActions.find(([investigatorId]) => investigatorId === playerIdToUse)
                  setSelectedInvestigation(playerInvestigation ? playerInvestigation[1] : null)
                }
                
                // Update investigation result from master state
                if (masterState.investigationResults) {
                  const playerResult = masterState.investigationResults.find(([investigatorId]) => investigatorId === playerIdToUse)
                  if (playerResult && playerResult[1]) {
                    const target = masterState.players.find(p => p.id === playerResult[1].targetId)
                    setInvestigationResult({
                      targetId: playerResult[1].targetId,
                      targetName: target?.name || 'Unknown',
                      alignment: playerResult[1].alignment
                    })
                  }
                }
              }
              
              else if (currentPlayer.role.power === POWERS.CITIZEN) {
                // For citizen roles - get alive players except self for suspicion voting
                const suspicionTargets = masterState.players.filter(p => 
                  p.alive && p.id !== playerIdToUse
                ).map(p => ({ id: p.id, name: p.name }))
                setSuspicionTargets(suspicionTargets)
                
                // Update player's suspicion vote from master state
                if (masterState.suspicionVotes) {
                  const playerSuspicion = masterState.suspicionVotes.find(([voterId]) => voterId === playerIdToUse)
                  setSelectedSuspicion(playerSuspicion ? playerSuspicion[1] : null)
                  setHasSuspicionVoted(!!playerSuspicion)
                }
              }
            }
            
            // Update general night phase state
            setEliminatedPlayer(masterState.eliminatedPlayer)
            setSavedPlayer(masterState.savedPlayer)
            setMostSuspiciousPlayer(masterState.mostSuspiciousPlayer)
            
            // Update night actions completion status and results
            setNightActionsComplete(masterState.nightActionsComplete || false);
            if (masterState.nightActionsComplete) {
              setEliminatedPlayer(masterState.eliminatedPlayer);
              setSavedPlayer(masterState.savedPlayer);
              setMostSuspiciousPlayer(masterState.mostSuspiciousPlayer);
            }
          }

          // Handle day phase state updates
          if (masterState.gameState === GAME_STATES.DAY_PHASE) {
            // Set day phase targets from master state
            if (masterState.dayPhaseTargets) {
              console.log('📊 SessionPlayer day phase targets from master state:', masterState.dayPhaseTargets.length);
              setDayPhaseTargets(masterState.dayPhaseTargets);
            } else {
              // Fallback: filter alive players from master state
              const alivePlayers = masterState.players.filter(p => p.alive);
              console.log('📊 SessionPlayer day phase targets fallback - alive players:', alivePlayers.length);
              setDayPhaseTargets(alivePlayers);
            }

            // Convert accusations array back to object for UI (same as JoinRoom)
            if (masterState.accusations) {
              const accusationsObj = {}
              masterState.accusations.forEach(([accusedId, accusers]) => {
                const accusedPlayer = masterState.players?.find(p => p.id === accusedId)
                // Convert accuser IDs to names
                const accuserNames = accusers.map(accuserId => {
                  const accuserPlayer = masterState.players?.find(p => p.id === accuserId)
                  return accuserPlayer?.name || 'Unknown'
                })
                accusationsObj[accusedId] = {
                  name: accusedPlayer?.name || 'Unknown',
                  accusers: accuserNames,
                  voteCount: accusers.length
                }
              })
              setAccusations(accusationsObj)
            } else {
              setAccusations({})
            }

            setEliminationCountdown(masterState.eliminationCountdown);
          }
          
          // Update game end state
          if (masterState.winner) {
            setGameEndData({
              winner: masterState.winner,
              winCondition: masterState.winCondition,
              alivePlayers: masterState.players.filter(p => masterState.alivePlayers?.has(p.id)),
              allPlayers: masterState.players
            })
          }
        } else {
          console.log('⚠️ Player not found in master state:', playerIdToUse)
        }
      } else {
        console.log('⚠️ Missing data for game state update:', { 
          hasMasterState: !!masterState, 
          playerId: playerIdToUse 
        })
      }
    })

    newSocket.on(SOCKET_EVENTS.GAME_END, (data) => {
      console.log('🏁 Game ended for session player:', data)
      setGameEndData(data)
      setGameState(GAME_STATES.ENDED)
      setMessage(null)
    })

    // Add other game event listeners (same as regular players)
    newSocket.on(SOCKET_EVENTS.START_NIGHT_PHASE, () => {
      console.log('🌙 Night phase started for session player')
      setGameState(GAME_STATES.NIGHT_PHASE)
    })

    newSocket.on(SOCKET_EVENTS.START_DAY_PHASE, () => {
      console.log('☀️ Day phase started for session player')
      setGameState(GAME_STATES.DAY_PHASE)
    })

    newSocket.on(SOCKET_EVENTS.PLAYER_ELIMINATED, (data) => {
      console.log('💀 Player eliminated:', data.eliminatedPlayer?.name)
      if (data.eliminatedPlayer?.id === playerId) {
        setIsEliminated(true)
      }
      setEliminatedPlayer(data.eliminatedPlayer)
    })

    // Add night phase event listeners (same as JoinRoom)
    newSocket.on(SOCKET_EVENTS.BEGIN_MAFIA_VOTE, (data) => {
      console.log('🌙 Mafia voting phase started, targets:', data.targets)
      setVoteTargets(data.targets || [])
      setSelectedTarget(null)
      setHasVoted(false)
      setMafiaVotesLocked(false)
    })

    newSocket.on(SOCKET_EVENTS.MAFIA_VOTES_UPDATE, (data) => {
      console.log('🗳️ Mafia votes update:', data.votes)
      setMafiaVotes(data.votes || {})
    })

    newSocket.on(SOCKET_EVENTS.CONSENSUS_TIMER_START, (data) => {
      console.log('⏰ Consensus timer started:', data)
      setConsensusTimer(data)
    })

    newSocket.on(SOCKET_EVENTS.CONSENSUS_TIMER_CANCELLED, () => {
      console.log('⏰ Consensus timer cancelled')
      setConsensusTimer(null)
    })

    newSocket.on(SOCKET_EVENTS.MAFIA_VOTES_LOCKED, () => {
      console.log('🔒 Mafia votes locked')
      setMafiaVotesLocked(true)
    })

    newSocket.on(SOCKET_EVENTS.BEGIN_DOCTOR_ACTION, (data) => {
      console.log('🏥 Doctor action phase started, targets:', data.targets)
      setHealTargets(data.targets || [])
      setSelectedHeal(null)
    })

    newSocket.on(SOCKET_EVENTS.BEGIN_SEER_ACTION, (data) => {
      console.log('🔍 Seer action phase started, targets:', data.targets)
      setInvestigateTargets(data.targets || [])
      setSelectedInvestigation(null)
    })

    newSocket.on(SOCKET_EVENTS.SEER_RESULT, (data) => {
      console.log('🔍 Seer investigation result:', data)
      setInvestigationResult(data)
    })

    newSocket.on('disconnect', () => {
      if (status === 'authenticating') {
        setStatus('error')
        setAuthMessage('Connection lost during authentication')
        setTimeout(() => navigate(`/join/${roomId}`), 3000)
      }
    })

    newSocket.on('connect_error', () => {
      if (status === 'authenticating') {
        setStatus('error')
        setAuthMessage('Failed to connect to server')
        setTimeout(() => navigate(`/join/${roomId}`), 3000)
      }
    })

    newSocket.on('error', (data) => {
      console.log('❌ Error received:', data)
      setMessage({ type: 'error', text: data.message })
    })

    return () => {
      console.log('🧹 Cleaning up SessionPlayer socket and connection manager')
      if (manager) {
        manager.cleanup()
      }
      if (newSocket) {
        newSocket.removeAllListeners()
        newSocket.close()
      }
    }
  }, [roomId, sessionToken, navigate]) // Only depend on URL params

  // Helper function to handle player ready action
  const handleReady = () => {
    if (!isReady && socket) {
      socket.emit(SOCKET_EVENTS.PLAYER_READY)
      setIsReady(true)
    }
  }

  // Night action handlers (same as JoinRoom)
  const handleMafiaVote = (targetId) => {
    if (!socket || mafiaVotesLocked) return
    
    console.log('🗳️ Mafia vote:', targetId)
    socket.emit(SOCKET_EVENTS.MAFIA_VOTE, { targetId })
    setSelectedTarget(targetId)
  }

  const handleDoctorHeal = (targetId) => {
    if (!socket) return
    
    console.log('🏥 Doctor heal:', targetId)
    socket.emit(SOCKET_EVENTS.DOCTOR_HEAL, { targetId })
    setSelectedHeal(targetId)
  }

  const handleSeerInvestigate = (targetId) => {
    if (!socket || selectedInvestigation) return // Prevent multiple investigations
    
    console.log('🔍 Seer investigate:', targetId)
    socket.emit(SOCKET_EVENTS.SEER_INVESTIGATE, { targetId })
    setSelectedInvestigation(targetId)
  }

  // Day phase action handler (same as JoinRoom)
  const handleAccusation = (targetId) => {
    if (!socket || isEliminated) return // Prevent dead players from voting
    
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

  // Suspicion vote handler for citizens during night phase
  const handleSuspicionVote = (targetId) => {
    if (!socket || isEliminated || hasSuspicionVoted) return // Prevent dead players from voting and multiple votes
    
    socket.emit(SOCKET_EVENTS.SUSPICION_VOTE, { targetId })
    console.log('Cast suspicion vote for:', targetId)
    setSelectedSuspicion(targetId)
    setHasSuspicionVoted(true)
    setMessage(null) // Clear any old messages
  }

  // If still authenticating, show authentication screen
  console.log('🎮 SessionPlayer render - current status:', status, 'gameState:', gameState, 'playerName:', playerName)
  
  if (status === 'authenticating') {
    return (
      <div className="session-auth-container">
        <div className="session-auth-content">
          <div className="session-header">
            <h1>🎮 Loading Game</h1>
            <p>Room: <strong>{roomId}</strong></p>
          </div>

          <div className="session-status">
            <div className="spinner"></div>
            <p>{authMessage}</p>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'authenticated') {
    return (
      <div className="session-auth-container">
        <div className="session-auth-content">
          <div className="session-header">
            <h1>🎮 Loading Game</h1>
            <p>Room: <strong>{roomId}</strong></p>
          </div>

          <div className="session-status">
            <div className="success-icon">✅</div>
            <p>{authMessage}</p>
            <p>Loading game state...</p>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'invalid' || status === 'error') {
    return (
      <div className="session-auth-container">
        <div className="session-auth-content">
          <div className="session-header">
            <h1>🔗 Session Error</h1>
            <p>Room: <strong>{roomId}</strong></p>
          </div>

          <div className="session-status">
            <div className="error-icon">❌</div>
            <p>{authMessage}</p>
            <p>Redirecting to join page...</p>
          </div>
        </div>
      </div>
    )
  }

  // Once authenticated and ready, show the appropriate game screen
  // This is the same logic as JoinRoom but without the join form

  // Game ended screen
  if (gameState === GAME_STATES.ENDED) {
    if (!gameEndData) {
      return (
        <div className="waiting-container">
          <div className="waiting-content">
            <div className="spinner"></div>
            <h2>Loading game results...</h2>
          </div>
        </div>
      )
    }

    // Show game results (same as JoinRoom)
    return (
      <div className="game-end-container">
        <div className="game-end-header">
          <h1>Game Over!</h1>
          <div className="victory-announcement">
            <div className="victory-icon">
              {gameEndData.winner === 'villagers' ? '🎉' : '😈'}
            </div>
            <h2>{gameEndData.winner === 'villagers' ? 'Villagers Win!' : 'Mafia Wins!'}</h2>
            <p className="win-condition">{gameEndData.winCondition}</p>
          </div>
        </div>
      </div>
    )
  }

  // Role assignment screen  
  if (gameState === GAME_STATES.ROLE_ASSIGNMENT) {
    if (!playerRole) {
      return (
        <div className="role-container">
          <div className="role-content">
            <div className="role-header">
              <h1>Loading Your Role...</h1>
            </div>
            <div className="role-loading">
              <div className="spinner"></div>
              <p>Retrieving your role assignment...</p>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="role-container">
        <div className="role-content">
          <div className="role-header">
            <div className="warning-banner">⚠️ <strong>SECRET ROLE</strong> ⚠️</div>
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

            {/* Show the new power-based description prominently */}
            {playerRole.powerDescription && (
              <div className="role-power">
                <h3>Your Power</h3>
                <p className="power-description">
                  <strong>{playerRole.powerDescription}</strong>
                </p>
              </div>
            )}

            <div className="role-description">
              <h3>Background</h3>
              <p>{playerRole.description}</p>
            </div>

            <div className="role-ability">
              <h3>How to Use Your Power</h3>
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



  // Night phase screen with role-specific interfaces
  if (gameState === GAME_STATES.NIGHT_PHASE && playerRole) {
    if (isEliminated) {
      return (
        <div className="eliminated-container">
          <div className="eliminated-content">
            <div className="eliminated-header">
              <div className="death-icon">💀</div>
              <h1>You Have Been Eliminated</h1>
              <p className="elimination-subtitle">But you can still watch the game unfold...</p>
            </div>
            <div className="spectator-info">
              <h3>👻 You Are Now a Spectator</h3>
              <p>The game continues, but your voice has been silenced.</p>
            </div>
          </div>
        </div>
      )
    }

    // Mafia voting interface - check if this player is evil (Mafia/Werewolf)
    if (playerRole.alignment === 'evil') {
      // If we haven't received vote targets yet, show loading
      if (voteTargets.length === 0) {
        return (
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

      return (
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

                {selectedTarget && !mafiaVotesLocked && (
                  <div className="vote-confirmation">
                    <p>🎯 You have voted to eliminate <strong>{voteTargets.find(t => t.id === selectedTarget)?.name}</strong></p>
                    <small className="consensus-info">
                      Waiting for team consensus...
                    </small>
                  </div>
                )}

                {mafiaVotesLocked && (
                  <div className="vote-locked">
                    <p>🔒 Votes Locked</p>
                    <small className="locked-info">
                      Your team has reached consensus. The target will be eliminated.
                    </small>
                  </div>
                )}

                {consensusTimer && (
                  <div className="consensus-timer">
                    <p>⏰ Consensus reached! Eliminating <strong>{consensusTimer.targetName}</strong> in {consensusTimer.timeLeft}s</p>
                  </div>
                )}

                {nightActionsComplete && (
                  <div className="night-complete-status">
                    <h3>✅ All Night Actions Complete!</h3>
                    {eliminatedPlayer && <p>💀 <strong>{eliminatedPlayer.name}</strong> was eliminated</p>}
                    {savedPlayer && <p>🛡️ Someone was saved from elimination!</p>}
                    {!eliminatedPlayer && !savedPlayer && <p>🌙 No one was eliminated</p>}
                    {mostSuspiciousPlayer && <p>🕵️ <strong>{mostSuspiciousPlayer.name}</strong> draws suspicion</p>}
                    <p><small>Waiting for day phase to begin...</small></p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )
    }

    // Healing interface (Doctor/Healer/Priest/Medic)
    if (playerRole.power === POWERS.HEAL) {
      if (healTargets.length === 0) {
        return (
          <div className="night-container">
            <div className="night-wait-container">
              <div className="night-wait-content">
                <div className="night-header">
                  <div className="night-icon">🌙</div>
                  <h1>Night Phase</h1>
                  <p className="role-reminder">You are: <strong style={{ color: playerRole.color }}>{playerRole.name}</strong></p>
                </div>

                <div className="sleep-section">
                  <h2>Preparing Medical Kit...</h2>
                  <div className="night-progress">
                    <div className="night-spinner"></div>
                    <p>Gathering patient information...</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      }

      return (
        <div className="night-container">
          <div className="doctor-heal-container">
            <div className="doctor-heal-content">
              <div className="night-header">
                <div className="night-icon">🏥</div>
                <h1>Night Phase</h1>
                <p className="role-reminder">You are: <strong style={{ color: playerRole.color }}>{playerRole.name}</strong></p>
              </div>

              <div className="heal-section">
                <h2>Choose Someone to Protect</h2>
                <p>Select a player to protect from elimination tonight:</p>
                
                <div className="target-list">
                  {healTargets.map((target) => (
                    <button
                      key={target.id}
                      className={`target-btn ${selectedHeal === target.id ? 'selected' : ''}`}
                      onClick={() => handleDoctorHeal(target.id)}
                    >
                      <span className="target-name">{target.name}</span>
                      {selectedHeal === target.id && <span className="vote-indicator">✓ Protected</span>}
                    </button>
                  ))}
                </div>

                {selectedHeal && (
                  <div className="heal-confirmation">
                    {nightActionsComplete ? (
                      <div className="night-complete-status">
                        <p>✅ All night actions complete! Results:</p>
                        {eliminatedPlayer && <p>💀 <strong>{eliminatedPlayer.name}</strong> was eliminated</p>}
                        {savedPlayer && <p>🛡️ Someone was saved from elimination!</p>}
                        {!eliminatedPlayer && !savedPlayer && <p>🌙 No one was eliminated</p>}
                        {mostSuspiciousPlayer && <p>🕵️ <strong>{mostSuspiciousPlayer.name}</strong> draws suspicion</p>}
                        <p><small>Waiting for day phase to begin...</small></p>
                      </div>
                    ) : (
                      <>
                        <p>🛡️ You are protecting <strong>{healTargets.find(t => t.id === selectedHeal)?.name}</strong> tonight</p>
                        <small>They will survive if targeted for elimination.</small>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )
    }

    // Investigation interface (Seer/Detective/Oracle/Agent)
    if (playerRole.power === POWERS.INVESTIGATE) {
      if (investigateTargets.length === 0) {
        return (
          <div className="night-container">
            <div className="night-wait-container">
              <div className="night-wait-content">
                <div className="night-header">
                  <div className="night-icon">🌙</div>
                  <h1>Night Phase</h1>
                  <p className="role-reminder">You are: <strong style={{ color: playerRole.color }}>{playerRole.name}</strong></p>
                </div>

                <div className="sleep-section">
                  <h2>Consulting the Spirits...</h2>
                  <div className="night-progress">
                    <div className="night-spinner"></div>
                    <p>Preparing mystical vision...</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      }

      return (
        <div className="night-container">
          <div className="seer-investigate-container">
            <div className="seer-investigate-content">
              <div className="night-header">
                <div className="night-icon">🔮</div>
                <h1>Night Phase</h1>
                <p className="role-reminder">You are: <strong style={{ color: playerRole.color }}>{playerRole.name}</strong></p>
              </div>

              <div className="investigate-section">
                <h2>Choose Someone to Investigate</h2>
                <p>Select a player to learn their true alignment:</p>
                
                <div className="target-list">
                  {investigateTargets.map((target) => (
                    <button
                      key={target.id}
                      className={`target-btn ${selectedInvestigation === target.id ? 'selected' : ''}`}
                      onClick={() => handleSeerInvestigate(target.id)}
                      disabled={!!selectedInvestigation}
                    >
                      <span className="target-name">{target.name}</span>
                      {selectedInvestigation === target.id && <span className="vote-indicator">✓ Investigating</span>}
                    </button>
                  ))}
                </div>

                {selectedInvestigation && !investigationResult && (
                  <div className="investigate-confirmation">
                    <p>🔍 You are investigating <strong>{investigateTargets.find(t => t.id === selectedInvestigation)?.name}</strong></p>
                    <small>Your mystical vision is revealing their true nature...</small>
                  </div>
                )}

                {investigationResult && (
                  <div className="investigation-result">
                    <h3>🔮 Vision Revealed!</h3>
                    <p>
                      <strong>{investigationResult.targetName}</strong> is aligned with the{' '}
                      <span className={`alignment-${investigationResult.alignment}`}>
                        {investigationResult.alignment === 'good' ? 'Villagers 😇' : 'Evil Forces 😈'}
                      </span>
                    </p>
                    <small>Your investigation is complete for this night.</small>
                  </div>
                )}

                {nightActionsComplete && (
                  <div className="night-complete-status">
                    <h3>✅ All Night Actions Complete!</h3>
                    {eliminatedPlayer && <p>💀 <strong>{eliminatedPlayer.name}</strong> was eliminated</p>}
                    {savedPlayer && <p>🛡️ Someone was saved from elimination!</p>}
                    {!eliminatedPlayer && !savedPlayer && <p>🌙 No one was eliminated</p>}
                    {mostSuspiciousPlayer && <p>🕵️ <strong>{mostSuspiciousPlayer.name}</strong> draws suspicion</p>}
                    <p><small>Waiting for day phase to begin...</small></p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )
    }

    // Default: Citizen suspicion voting interface
    if (suspicionTargets.length === 0) {
      return (
        <div className="night-container">
          <div className="night-wait-container">
            <div className="night-wait-content">
              <div className="night-header">
                <div className="night-icon">🌙</div>
                <h1>Night Phase</h1>
                {playerRole && (
                  <p className="role-reminder">You are: <strong style={{ color: playerRole.color }}>{playerRole.name}</strong></p>
                )}
              </div>

              <div className="sleep-section">
                <h2>Gathering Information...</h2>
                <div className="night-progress">
                  <div className="night-spinner"></div>
                  <p>Preparing to assess who seems suspicious...</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="night-container">
        <div className="mafia-vote-container">
          <div className="mafia-vote-content">
            <div className="night-header">
              <div className="night-icon">🤔</div>
              <h1>Night Phase</h1>
              {playerRole && (
                <p className="role-reminder">You are: <strong style={{ color: playerRole.color }}>{playerRole.name}</strong></p>
              )}
            </div>

            <div className="vote-section">
              <h2>Who Seems Suspicious?</h2>
              <p>While the town sleeps, reflect on who you find most suspicious. Your vote is private and anonymous:</p>
              
              <div className="target-list">
                {suspicionTargets.map((target) => (
                  <button
                    key={target.id}
                    className={`target-btn ${selectedSuspicion === target.id ? 'selected' : ''}`}
                    onClick={() => handleSuspicionVote(target.id)}
                    disabled={hasSuspicionVoted}
                  >
                    <span className="target-name">{target.name}</span>
                    {selectedSuspicion === target.id && <span className="vote-indicator">✓ Suspicious</span>}
                  </button>
                ))}
              </div>

              {selectedSuspicion && (
                <div className="vote-confirmation">
                  {nightActionsComplete ? (
                    <div className="night-complete-status">
                      <p>✅ All night actions complete! Results:</p>
                      {eliminatedPlayer && <p>💀 <strong>{eliminatedPlayer.name}</strong> was eliminated</p>}
                      {savedPlayer && <p>🛡️ Someone was saved from elimination!</p>}
                      {!eliminatedPlayer && !savedPlayer && <p>🌙 No one was eliminated</p>}
                      {mostSuspiciousPlayer && <p>🕵️ <strong>{mostSuspiciousPlayer.name}</strong> draws suspicion</p>}
                      <p><small>Waiting for day phase to begin...</small></p>
                    </div>
                  ) : (
                    <>
                      <p>🕵️ You find <strong>{suspicionTargets.find(t => t.id === selectedSuspicion)?.name}</strong> most suspicious</p>
                      <small>Your suspicion has been recorded anonymously.</small>
                    </>
                  )}
                </div>
              )}

              {!selectedSuspicion && !nightActionsComplete && (
                <div className="vote-confirmation">
                  <p className="suspicion-note">💭 Think carefully about the day's discussions and behaviors...</p>
                  <small>Everyone gets to vote so it's harder to tell who has special roles!</small>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Day phase screen (same as JoinRoom)
  if (gameState === GAME_STATES.DAY_PHASE && playerRole) {
    if (isEliminated) {
      return (
        <div className="eliminated-container">
          <div className="eliminated-content">
            <div className="eliminated-header">
              <div className="death-icon">💀</div>
              <h1>You Have Been Eliminated</h1>
              <p className="elimination-subtitle">But you can still watch the voting...</p>
            </div>
            <div className="spectator-info">
              <h3>👻 You Are Now a Spectator</h3>
              <p>Watch as the remaining players try to find the killers.</p>
            </div>
          </div>
        </div>
      )
    }

    // Filter out self, but show all players if filtering results in empty list (fallback)
    const votableTargets = dayPhaseTargets.filter(player => player.id !== playerId)
    const playersToShow = votableTargets.length > 0 ? votableTargets : dayPhaseTargets
    
    console.log('SessionPlayer day phase debug:', {
      playerId,
      totalTargets: dayPhaseTargets.length,
      votableTargets: votableTargets.length,
      playersToShow: playersToShow.length
    })

    return (
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
                      <span className="accusation-text">
                        {accusationData.accusers.join(', ')} accuses {accusationData.name} - {accusationData.voteCount} Votes
                      </span>
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

  // Default: show waiting screen (lobby state)
  return (
    <div className="waiting-container">
      <div className="waiting-content">
        <div className="spinner"></div>
        <h2>Joined Game Lobby</h2>
        <p>Room: <strong>{roomId}</strong></p>
        <p>Playing as: <strong>{playerName}</strong></p>
        <p>Waiting for host to start the game...</p>
        
        {message && (
          <div className={`message ${message.type}`}>
            {message.text}
          </div>
        )}
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
        <Route path="/room/:roomId/player/:sessionToken" element={<SessionPlayer />} />
      </Routes>
    </div>
  )
}

export default App 
