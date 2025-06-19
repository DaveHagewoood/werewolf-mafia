// Connection state enums
export const PlayerConnectionState = {
  CONNECTED: 'CONNECTED',
  ATTEMPTING_RECONNECTION: 'ATTEMPTING_RECONNECTION',
  PAUSED: 'PAUSED',
  DISCONNECTED: 'DISCONNECTED'
};

export const GameConnectionState = {
  ACTIVE: 'ACTIVE',
  PAUSED_RECONNECTING: 'PAUSED_RECONNECTING',
  ENDED: 'ENDED'
};

// Reconnection protocol configuration
export const RECONNECTION_CONFIG = {
  maxAttempts: 5,
  attemptDelay: 1000,
  escalationFactor: 1.5,
  maxDelay: 5000,
  totalTimeout: 30000
};

// Additional socket events for enhanced reconnection
export const RECONNECTION_EVENTS = {
  STATE_SYNC_REQUEST: 'state-sync-request',
  STATE_SYNC_RESPONSE: 'state-sync-response',
  RECONNECTION_FAILED: 'reconnection-failed',
  CLIENT_PAUSED: 'client-paused',
  VERSION_MISMATCH: 'version-mismatch'
}; 