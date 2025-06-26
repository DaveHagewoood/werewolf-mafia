# Project Rules & Development Guidelines

## Testing & Development Rules

### ✅ Rule 1: Use Local Testing for Development 
**Why**: Local testing provides faster iteration cycles for debugging and development.

**Benefits**:
- Immediate feedback without deployment delays
- Direct access to server console logs
- Ability to use breakpoints and real-time debugging
- Faster development workflow

**Requirements**:
- Update URLs to localhost before local testing
- Use deployment testing for final validation
- Be aware of URL configuration differences

**Local Testing Process**:
1. **Update URLs**: Switch to localhost endpoints in all apps
2. **Start Local Servers**: Run host, player, and server apps locally
3. **Test Changes**: Debug and iterate quickly
4. **Switch Back**: Update URLs to production before deployment
5. **Deploy & Validate**: Final testing on Render.com

**Exceptions**:
- Use deployment testing for production validation
- Use deployed environment when debugging deployment-specific issues

### ✅ Preferred Testing Approach
1. **Local Development**: Use localhost URLs for fast iteration
2. **Syntax Validation**: Use `node -c` to check syntax
3. **Local Testing**: Test functionality with local servers running
4. **Code Review**: Review logic and implementation  
5. **Switch URLs**: Update to production URLs before deployment
6. **Git Push**: Push changes to main branch
7. **Auto-Deploy**: Render.com automatically deploys from git push
8. **Final Validation**: Test functionality in deployed Render.com environment

### 🚀 Deployment Process
**Platform**: Render.com
**Trigger**: Automatic deployment on git push to main branch
**Workflow**:
1. Make code changes locally
2. Test syntax with `node -c filename.js`
3. Commit changes to git
4. Push to main branch: `git push origin main`
5. Render.com automatically detects push and deploys
6. Test functionality on deployed Render.com URLs
7. Monitor Render.com logs for any issues

## Architecture Rules

### Rule 2: Pure State-Based Architecture
- Clients should interpret state, not react to individual events
- If information is in the state, don't send it as a separate event
- Make incremental changes with thorough testing

### Rule 3: Backward Compatibility During Transitions
- Keep existing event handlers working until replacements are confirmed
- Use feature flags if needed for gradual rollout
- Test each change thoroughly before removing old code

## Development Workflow Rules

### Rule 4: Small, Incremental Changes
- Make one small change at a time
- Test thoroughly after each change
- Document what was changed and why
- Update progress tracking documents

### Rule 5: Comprehensive Documentation
- Update implementation plans when changes are made
- Document architectural decisions and rationale
- Keep progress summaries current
- Update API documentation when interfaces change

## Code Quality Rules

### Rule 6: Server-Side Logic Centralization
- All game state calculations should happen server-side
- Clients should not perform game logic calculations
- Use helper functions for complex state derivations

### Rule 7: Error Handling and Logging
- Add comprehensive error handling for all state changes
- Use descriptive console logging for debugging
- Include context in error messages

---

**Last Updated**: [Current Date]
**Status**: Active - All developers must follow these rules 