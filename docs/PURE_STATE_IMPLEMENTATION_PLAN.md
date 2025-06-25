# Pure State-Based Architecture - Implementation Plan

## Overview
This document outlines the incremental implementation plan for converting from the current hybrid event-driven/state-based architecture to a pure state-based architecture.

## Goals
- Eliminate redundant events that duplicate information already in game state
- Simplify client-side logic to pure state interpretation
- Improve debugging, testing, and maintainability
- Reduce race conditions and state synchronization issues

## Implementation Strategy: Small, Incremental Steps

### 🎯 Phase 1: Enhance State Comprehensiveness
**Goal**: Make the game state more comprehensive so it contains all information clients need

**Step 1.1: Enhance Player State Information**
- Add `actionStatus` field to player objects ('WAITING_FOR_ACTION', 'COMPLETED', 'ELIMINATED')
- Add `hasActed` boolean to track if player has completed their phase action
- Add role-specific capability flags (`canVote`, `canHeal`, `canInvestigate`)

**Step 1.2: Add Derived Action Information**
- Add `availableActions` array to state (derived server-side)
- Add `actionTargets` array with available targets for current player
- Add `timeRemaining` for current phase

**Step 1.3: Consolidate Phase-Specific Data**
- Create comprehensive `phaseData` object containing all phase-specific information
- Include consensus progress, eliminated players, investigation results, etc.

### 🎯 Phase 2: Remove Redundant Events (One at a Time)
**Goal**: Remove events that are now redundant with comprehensive state

**Step 2.1: Remove ROLE_ASSIGNED Event**
- Client should get role from `state.players[currentPlayer].role`
- Test that role assignment still works correctly

**Step 2.2: Remove START_NIGHT_PHASE Event**  
- Client should detect night phase from `state.gamePhase === 'NIGHT_PHASE'`
- Test that night phase transition works correctly

**Step 2.3: Remove READINESS_UPDATE Event**
- Client should get readiness from `state.players[].isReady`
- Test that readiness tracking works correctly

**Step 2.4: Remove Additional Events**
- Remove `PLAYERS_UPDATE`, `MAFIA_VOTES_UPDATE`, etc. one by one
- Test each removal thoroughly

### 🎯 Phase 3: Simplify Client Logic
**Goal**: Replace event-driven logic with state interpretation

**Step 3.1: Refactor Player UI Logic**
- Replace event handlers with state interpretation functions
- Use pure functions to determine what UI to show based on state

**Step 3.2: Simplify Host UI Logic** 
- Update host app to rely purely on state updates
- Remove redundant event handling

### 🎯 Phase 4: Optimize and Clean Up
**Goal**: Final optimizations and cleanup

**Step 4.1: Optimize State Broadcasting**
- Ensure state updates are efficient
- Add state diffing if needed for performance

**Step 4.2: Clean Up Dead Code**
- Remove unused event handlers and related code
- Update documentation

## Current State Analysis

### Events Currently Used by Player App
```javascript
// From apps/player/src/App.jsx analysis:
socket.on('ROLE_ASSIGNED', handleRoleAssigned);           // ❌ Remove in Step 2.1
socket.on('GAME_START', handleGameStart);                 // ❌ Redundant  
socket.on('START_NIGHT_PHASE', handleNightPhase);         // ❌ Remove in Step 2.2
socket.on('READINESS_UPDATE', handleReadinessUpdate);     // ❌ Remove in Step 2.3
socket.on('PLAYERS_UPDATE', handlePlayersUpdate);         // ❌ Remove in Step 2.4
socket.on('GAME_STATE_UPDATE', handleGameStateUpdate);    // ✅ Keep - main event
```

### Target State Structure
```javascript
const enhancedGameState = {
  // Core game info
  gamePhase: 'NIGHT_PHASE',
  currentPlayer: 'player123',
  timeRemaining: 45000,
  
  // Enhanced player information
  players: [{
    id: 'player123',
    name: 'Alice',
    role: 'DOCTOR',
    isAlive: true,
    isReady: true,
    actionStatus: 'WAITING_FOR_HEAL',  // NEW
    hasActed: false,                   // NEW
    canVote: false,                    // NEW
    canHeal: true,                     // NEW  
    canInvestigate: false,             // NEW
    isHealed: false,                   // NEW
    investigationResult: null          // NEW
  }],
  
  // Derived action info (NEW)
  availableActions: ['heal'],
  actionTargets: [{id: 'player456', name: 'Bob'}],
  
  // Consolidated phase data (ENHANCED)
  phaseData: {
    // Night phase
    nightProgress: 0.75,
    mafiaVoteComplete: false,
    doctorHealComplete: false,
    seerInvestigateComplete: false,
    
    // Day phase  
    eliminatedPlayer: {id: 'player789', name: 'Carol'},
    
    // Voting phase
    accusations: [{accuser: 'player123', accused: 'player456'}],
    voteCounts: {'player456': 2},
    
    // General
    consensusProgress: 0.75
  }
}
```

## Implementation Steps

### ✅ Step 1.1 - Enhance Player State Information (COMPLETED)
**What we did**:
1. ✅ Enhanced `GameStateManager.getMasterGameState()` to include new fields
2. ✅ Added comprehensive action status tracking for all players
3. ✅ Added role-specific capability flags (`canVote`, `canHeal`, `canInvestigate`, `canMafiaVote`)
4. ✅ Added individual action status (`actionStatus`, `hasActed`, `isHealed`, `investigationResult`)

**Files modified**:
- ✅ `apps/server/gameStateManager.js` - enhanced player state generation

**Enhanced fields added**:
```javascript
// Each player object now includes:
actionStatus: 'WAITING_FOR_ACTION' | 'COMPLETED' | 'ELIMINATED',
hasActed: boolean,
canVote: boolean,
canHeal: boolean, 
canInvestigate: boolean,
canMafiaVote: boolean,
isHealed: boolean,
investigationResult: string | null
```

**Success criteria**:
- ✅ Enhanced state structure implemented
- ✅ Syntax check passed
- ✅ Ready for client-side testing

### ✅ Step 1.2 - Add Derived Action Information (COMPLETED)
**What we did**:
1. ✅ Added comprehensive `derivedActions` object with per-player action calculations
2. ✅ Added `availableActions` array for each player (e.g., `['mafia_vote', 'heal', 'investigate']`)
3. ✅ Added `actionTargets` array with available targets and action context
4. ✅ Added `primaryAction` and `actionContext` for clearer UI guidance
5. ✅ Added `timeRemaining` calculation with phase-specific timeouts
6. ✅ Added `phaseStartTime` tracking for accurate timing

**Enhanced State Structure**:
```javascript
masterState.derivedActions = {
  'player123': {
    availableActions: ['heal'],
    actionTargets: [{id: 'player456', name: 'Bob', action: 'heal'}],
    primaryAction: 'heal',
    actionContext: {description: 'Protect a player from elimination'}
  }
}
masterState.timeRemaining = 45000 // milliseconds left in phase
```

### Next Step: Step 1.3 - Consolidate Phase-Specific Data
**What we'll do**:
1. Create comprehensive `phaseData` object containing all phase-specific information
2. Include consensus progress, eliminated players, investigation results, etc.
3. Test the fully enhanced comprehensive state

### Risk Mitigation
- Make one small change at a time
- Test thoroughly after each change
- Keep existing event handlers working until replacement is confirmed
- Use feature flags if needed for gradual rollout

## Testing Strategy

⚠️ **Important**: Following [Project Rules](../.cursor/rules/PROJECT_RULES.md), we do NOT test locally due to hard-coded URLs.

### After Each Step
1. **Syntax Validation**: Use `node -c filename.js` to check for syntax errors
2. **Code Review**: Review logic and implementation thoroughly
3. **Deploy to Staging**: Test functionality in staging environment
4. **Monitor Production Logs**: Use server logs for state inspection
5. **No Regressions**: Verify existing features through deployment testing

### Integration Testing
- Deploy changes to staging environment
- Test complete game flow after each phase
- Verify state synchronization between host and players through staging
- Test reconnection functionality in deployed environment
- Monitor server logs for state structure verification

## Documentation Updates
- Update API reference after each phase
- Document state structure changes
- Update troubleshooting guides

---

**Current Status**: Planning Phase Complete  
**Next Step**: Step 1.1 - Enhance Player State Information  
**Timeline**: Incremental implementation with testing at each step 