import { PlayerConnectionState, RECONNECTION_CONFIG, SOCKET_EVENTS } from '@werewolf-mafia/shared';

class ConnectionManager {
  constructor(socket, onStateChange, onReconnectSuccess, onReconnectFailed) {
    this.socket = socket;
    this.onStateChange = onStateChange;
    this.onReconnectSuccess = onReconnectSuccess;
    this.onReconnectFailed = onReconnectFailed;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.connectionState = PlayerConnectionState.CONNECTED;
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.socket.on('disconnect', this.handleDisconnect.bind(this));
    this.socket.on(SOCKET_EVENTS.PLAYER_RECONNECTED, this.handleReconnectSuccess.bind(this));
    this.socket.on(SOCKET_EVENTS.RECONNECTION_FAILED, this.handleReconnectFailed.bind(this));
    this.socket.on(SOCKET_EVENTS.VERSION_MISMATCH, this.handleVersionMismatch.bind(this));
  }

  handleDisconnect(reason) {
    console.log('Disconnected from server:', reason);
    this.setConnectionState(PlayerConnectionState.ATTEMPTING_RECONNECTION);
    this.startReconnectionAttempts();
  }

  startReconnectionAttempts() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const attemptReconnect = () => {
      if (this.reconnectAttempts >= RECONNECTION_CONFIG.maxAttempts) {
        this.handleReconnectFailed('Max attempts reached');
        return;
      }

      this.reconnectAttempts++;
      const delay = Math.min(
        RECONNECTION_CONFIG.attemptDelay * Math.pow(RECONNECTION_CONFIG.escalationFactor, this.reconnectAttempts - 1),
        RECONNECTION_CONFIG.maxDelay
      );

      console.log(`Attempting reconnection ${this.reconnectAttempts}/${RECONNECTION_CONFIG.maxAttempts} after ${delay}ms`);

      this.reconnectTimer = setTimeout(() => {
        if (this.socket.disconnected) {
          this.socket.connect();
          attemptReconnect();
        }
      }, delay);
    };

    attemptReconnect();
  }

  handleReconnectSuccess(gameState) {
    console.log('Reconnection successful');
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.setConnectionState(PlayerConnectionState.CONNECTED);
    this.onReconnectSuccess(gameState);
  }

  handleReconnectFailed(reason) {
    console.log('Reconnection failed:', reason);
    this.setConnectionState(PlayerConnectionState.PAUSED);
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.onReconnectFailed(reason);
  }

  handleVersionMismatch(data) {
    console.log('State version mismatch detected');
    this.socket.emit(SOCKET_EVENTS.STATE_SYNC_REQUEST, {
      currentVersion: data.clientVersion
    });
  }

  setConnectionState(newState) {
    if (this.connectionState !== newState) {
      this.connectionState = newState;
      this.onStateChange(newState);
    }
  }

  cleanup() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket.removeAllListeners();
  }
}

export default ConnectionManager; 