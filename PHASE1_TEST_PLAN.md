# Phase 1 Test Plan: Basic Disconnect Handling

## What Phase 1 Implements
1. **Lobby Disconnect**: Players disconnecting from lobby are removed immediately
2. **Host Disconnect Tolerance**: 5-second grace period for host disconnects during active games
3. **Simplified Client Logic**: Removed complex reconnection tokens and localStorage

## Test Cases

### Test 1: Lobby Player Disconnect
**Steps:**
1. Host creates room
2. Player joins lobby (note player appears in host's player list)
3. Player closes browser tab or disconnects network
4. **Expected**: Player immediately disappears from host's player list
5. **Expected**: Player can rejoin with same name and different profile

### Test 2: Host Disconnect - Short (Under 5 seconds)
**Steps:**
1. Host creates room, player joins
2. Host starts game (role assignment phase)
3. Host disconnects (close browser briefly)
4. **Expected**: Game shows "Game paused - Host disconnected" on player screen
5. Host reopens browser and reconnects within 5 seconds
6. **Expected**: Game resumes, no end message

### Test 3: Host Disconnect - Long (Over 5 seconds)
**Steps:**
1. Host creates room, player joins
2. Host starts game (role assignment phase)  
3. Host disconnects (close browser)
4. **Expected**: Game shows "Game paused - Host disconnected" on player screen
5. Wait 6+ seconds
6. **Expected**: Game ends with "Game ended - Host disconnected" message

### Test 4: Game Phase Player Disconnect (Future)
**Steps:**
1. Complete game start to night phase
2. Player disconnects
3. **Expected**: Log message "Game-phase disconnect - Phase 2 will handle this"
4. **Expected**: No crash, game continues (for now)

## Success Criteria
- [ ] Lobby disconnects result in immediate player removal
- [ ] Host disconnects show pause message immediately  
- [ ] Host reconnection within 5s resumes game
- [ ] Host disconnects over 5s end game cleanly
- [ ] No complex reconnection attempts or localStorage usage
- [ ] Game doesn't crash on any disconnect scenario

## How to Test
1. Open host app in one browser tab
2. Open player app in another browser tab (or incognito)
3. Use browser dev tools → Network tab → "Offline" to simulate disconnects
4. Or simply close browser tabs to disconnect

This is the foundation for more complex reconnection in Phase 2. 