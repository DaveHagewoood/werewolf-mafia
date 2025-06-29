import { ConnectionStatus, SESSION_CONFIG, SOCKET_EVENTS } from '@werewolf-mafia/shared';

class SessionConnectionManager {
  constructor(socket, sessionToken, onStateChange, onGameStateUpdate) {
    this.socket = socket;
    this.sessionToken = sessionToken;
    this.onStateChange = onStateChange;
    this.onGameStateUpdate = onGameStateUpdate;
    this.connectionStatus = ConnectionStatus.CONNECTED;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.graceTimer = null;
    this.activityTimer = null;
    this.hasInitiallyConnected = false;
    this.setupEventListeners();
    this.startActivityPing();
  }

  setupEventListeners() {
    this.socket.on('disconnect', this.handleDisconnect.bind(this));
    this.socket.on('connect', this.handleConnect.bind(this));
    this.socket.on(SOCKET_EVENTS.GAME_STATE_UPDATE, this.onGameStateUpdate);
    this.socket.on(SOCKET_EVENTS.CONNECTION_STATUS_UPDATE, this.handleConnectionStatusUpdate.bind(this));
  }

  handleDisconnect(reason) {
    console.log('Socket disconnected:', reason);
    
    // Only start reconnection if we had initially connected
    if (!this.hasInitiallyConnected) {
      console.log('Initial connection failed, not attempting reconnection');
      this.setConnectionStatus(ConnectionStatus.DISCONNECTED);
      return;
    }
    
    // Start grace period before showing disconnected UI
    this.setConnectionStatus(ConnectionStatus.RECONNECTING);
    
    this.graceTimer = setTimeout(() => {
      if (this.connectionStatus === ConnectionStatus.RECONNECTING) {
        this.setConnectionStatus(ConnectionStatus.DISCONNECTED);
      }
    }, SESSION_CONFIG.RECONNECT_GRACE_PERIOD);

    this.startReconnectionAttempts();
  }

  handleConnect() {
    console.log('Socket connected - session token available:', !!this.sessionToken);
    this.hasInitiallyConnected = true;
    
    // Clear timers
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Always authenticate with session token if available (even if placeholder)
    if (this.sessionToken && this.sessionToken !== 'placeholder-session-token') {
      console.log('Authenticating with session token:', this.sessionToken.substring(0, 8) + '...');
      this.socket.emit(SOCKET_EVENTS.SESSION_RECONNECT, {
        sessionToken: this.sessionToken
      });
    } else {
      console.log('No valid session token - regular connection mode');
      this.setConnectionStatus(ConnectionStatus.CONNECTED);
    }
  }

  // Update session token after initial join
  updateSessionToken(newToken) {
    console.log('Updating session token:', newToken ? newToken.substring(0, 8) + '...' : 'null');
    this.sessionToken = newToken;
    
    // If we're connected and have a real token, authenticate now
    if (this.socket.connected && newToken && newToken !== 'placeholder-session-token') {
      console.log('Authenticating with updated session token');
      this.socket.emit(SOCKET_EVENTS.SESSION_RECONNECT, {
        sessionToken: newToken
      });
    }
  }

  startReconnectionAttempts() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const attemptReconnect = () => {
      if (this.reconnectAttempts >= SESSION_CONFIG.MAX_RECONNECT_ATTEMPTS) {
        console.log('Max reconnection attempts reached');
        return;
      }

      this.reconnectAttempts++;
      console.log(`Reconnection attempt ${this.reconnectAttempts}/${SESSION_CONFIG.MAX_RECONNECT_ATTEMPTS}`);

      this.reconnectTimer = setTimeout(() => {
        if (this.socket.disconnected) {
          this.socket.connect();
        }
        attemptReconnect();
      }, SESSION_CONFIG.RECONNECT_INTERVAL);
    };

    attemptReconnect();
  }

  handleConnectionStatusUpdate(data) {
    console.log('Connection status update:', data);
    
    if (data.status === 'authenticated') {
      this.reconnectAttempts = 0;
      this.setConnectionStatus(ConnectionStatus.CONNECTED);
    } else if (data.status === 'invalid_session') {
      this.setConnectionStatus(ConnectionStatus.DISCONNECTED);
      // Could trigger page refresh here
    }
  }

  setConnectionStatus(newStatus) {
    if (this.connectionStatus !== newStatus) {
      this.connectionStatus = newStatus;
      this.onStateChange(newStatus);
    }
  }

  // Send periodic activity ping to maintain connection status
  startActivityPing() {
    if (this.activityTimer) {
      clearInterval(this.activityTimer);
    }
    
    this.activityTimer = setInterval(() => {
      if (this.socket.connected && this.connectionStatus === ConnectionStatus.CONNECTED) {
        this.socket.emit('player-activity-ping');
      }
    }, 10000); // Ping every 10 seconds
  }

  // Manual refresh trigger for users
  refreshConnection() {
    window.location.reload();
  }

  cleanup() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
    if (this.activityTimer) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }
    this.socket.removeAllListeners();
  }
}

export default SessionConnectionManager; 